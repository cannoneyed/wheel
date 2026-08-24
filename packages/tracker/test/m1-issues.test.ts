// @vitest-environment node
/**
 * Issues core: offline create, two-client board move, cross-client undo,
 * rejection rollback, bulk edit as one undo step, and undo-create → archive
 * doctrine.
 */
import { describe, expect, test, vi } from 'vitest';

import { ServiceContext } from 'wheel/core';
import { World } from 'wheel/testing';

import * as teamsSync from '../src/sync/teams.sync';
import * as teamsServer from '../src/sync/teams.server';
import * as issuesSync from '../src/sync/issues.sync';
import * as issuesServer from '../src/sync/issues.server';
import * as commentsSync from '../src/sync/comments.sync';
import * as commentsServer from '../src/sync/comments.server';
import * as activitySync from '../src/sync/activity.sync';
import * as activityServer from '../src/sync/activity.server';
import { TEAMS_DDL } from '../src/sync/teams.server';
import { ISSUES_DDL } from '../src/sync/issues.server';
import { COMMENTS_DDL } from '../src/sync/comments.server';
import { ACTIVITY_DDL } from '../src/sync/activity.server';
import { PROJECTS_DDL } from '../src/sync/projects.server';
import { CYCLES_DDL } from '../src/sync/cycles.server';
import { INBOX_DDL } from '../src/sync/inbox.server';
import { applySeed, SEED, seedStateId } from '../seed/seed';
import { IssueService, type IssueDraft } from '../src/services/issue-service';
import { ToastService } from 'wheel/kit';

const TEAM = SEED.teams[0].id;
const TODO_STATE = seedStateId(0, 1);
const DONE_STATE = seedStateId(0, 4);

async function makeWorld(): Promise<World> {
  return World.create({
    syncModules: [teamsSync, issuesSync, commentsSync, activitySync],
    servers: [teamsServer, issuesServer, commentsServer, activityServer],
    setup: async (db) => {
      for (const statement of [...TEAMS_DDL, ...ISSUES_DDL, ...COMMENTS_DDL, ...ACTIVITY_DDL, ...PROJECTS_DDL, ...CYCLES_DDL, ...INBOX_DDL])
        await db.query(statement);
      await applySeed(db);
    }
  });
}

interface Session {
  client: Awaited<ReturnType<World['client']>>;
  context: ServiceContext;
  issues: IssueService;
}

async function primedSession(world: World, clientId: string): Promise<Session> {
  const client = await world.client(clientId);
  const context = new ServiceContext({ client });
  const issues = context.get(IssueService);
  // First read primes the lazy subscription; settle() awaits in-flight
  // subscribes, so one settle is enough.
  issues.issuesFor(TEAM);
  await world.settle();
  expect(issues.issuesFor(TEAM).length).toBeGreaterThan(0);
  return { client, context, issues };
}

const draft: IssueDraft = {
  title: 'Offline-created issue',
  description: '',
  stateId: TODO_STATE,
  priority: 2,
  assigneeId: null,
  estimate: null,
  dueDate: null,
  labelIds: []
};

describe('issues core', () => {
  test('scenario 1 — offline create: optimistic placeholder number, converges with a real number after reconnect', async () => {
    const world = await makeWorld();
    const a = await primedSession(world, 'web_a');
    const b = await primedSession(world, 'web_b');

    world.network.pause('web_a');
    const issueId = a.issues.create(TEAM, draft);

    // Optimistic on A: at the TOP of its state group, number pending (0).
    const optimistic = a.issues.issue(TEAM, issueId);
    expect(optimistic).toBeDefined();
    expect(optimistic!.number).toBe(0);
    expect(a.issues.issuesIn(TEAM, TODO_STATE)[0]?.id).toBe(issueId);
    // B knows nothing yet.
    expect(b.issues.issue(TEAM, issueId)).toBeUndefined();

    world.network.resume('web_a');
    await vi.waitFor(async () => {
      await world.settle();
      expect(b.issues.issue(TEAM, issueId)).toBeDefined();
    });
    // Server assigned the real number; both clients agree.
    expect(a.issues.issue(TEAM, issueId)!.number).toBeGreaterThan(0);
    expect(b.issues.issue(TEAM, issueId)!.number).toBe(a.issues.issue(TEAM, issueId)!.number);
    expect(b.issues.issuesIn(TEAM, TODO_STATE)[0]?.id).toBe(issueId);
    await world.close();
  });

  test('scenario 2 — board moves converge; concurrent moves of different issues compose', async () => {
    const world = await makeWorld();
    const a = await primedSession(world, 'web_c');
    const b = await primedSession(world, 'web_d');

    const [first, second] = a.issues.issuesIn(TEAM, TODO_STATE);
    expect(second).toBeDefined();

    // Concurrent: A moves `first` to Done, B moves `second` to Done.
    a.issues.moveToState(TEAM, first.id, DONE_STATE);
    b.issues.moveToState(TEAM, second.id, DONE_STATE);
    await world.settle();

    for (const session of [a, b]) {
      expect(session.issues.issue(TEAM, first.id)!.stateId).toBe(DONE_STATE);
      expect(session.issues.issue(TEAM, second.id)!.stateId).toBe(DONE_STATE);
    }
    // Identical board order on both clients (whole-row deltas rebased).
    expect(a.issues.boardIn(TEAM, DONE_STATE).map((row) => row.id)).toEqual(
      b.issues.boardIn(TEAM, DONE_STATE).map((row) => row.id)
    );
    await world.close();
  });

  test('scenario 3 — undo propagates cross-client', async () => {
    const world = await makeWorld();
    const a = await primedSession(world, 'web_e');
    const b = await primedSession(world, 'web_f');

    const target = a.issues.issuesIn(TEAM, TODO_STATE)[0];
    const originalTitle = target.title;
    a.issues.update(target.id, { title: 'Renamed by A' });
    await world.settle();
    expect(b.issues.issue(TEAM, target.id)!.title).toBe('Renamed by A');

    a.issues.undo();
    await world.settle();
    expect(a.issues.issue(TEAM, target.id)!.title).toBe(originalTitle);
    expect(b.issues.issue(TEAM, target.id)!.title).toBe(originalTitle);
    await world.close();
  });

  test('scenario 4 — editing an archived issue rejects, rolls back, and raises a toast', async () => {
    const world = await makeWorld();
    const a = await primedSession(world, 'web_g');
    const toasts = a.context.get(ToastService);

    const target = a.issues.issuesIn(TEAM, TODO_STATE)[0];
    a.issues.archive([target.id]);
    await world.settle();
    expect(a.issues.issue(TEAM, target.id)!.archivedAt).not.toBeNull();

    const originalTitle = target.title;
    const handle = a.issues.update(target.id, { title: 'Should be rejected' });
    // Optimistic apply is visible…
    expect(a.issues.issue(TEAM, target.id)!.title).toBe('Should be rejected');
    const info = await handle.settled;
    await world.settle();
    // …then the typed rejection rolls it back.
    expect(info.state).toBe('rejected');
    expect(info.rejection?.code).toBe('archived');
    expect(a.issues.issue(TEAM, target.id)!.title).toBe(originalTitle);
    await vi.waitFor(() => {
      expect(toasts.toasts.get().some((toast) => toast.text.includes('archived'))).toBe(true);
    });
    await world.close();
  });

  test('bulk edit is ONE undo step with per-issue priors', async () => {
    const world = await makeWorld();
    const a = await primedSession(world, 'web_h');

    const targets = a.issues.issuesIn(TEAM, TODO_STATE).slice(0, 3);
    expect(targets.length).toBe(3);
    const priorPriorities = targets.map((issue) => issue.priority);

    a.issues.bulkUpdate(targets.map((issue) => issue.id), { priority: 1 });
    await world.settle();
    for (const issue of targets) {
      expect(a.issues.issue(TEAM, issue.id)!.priority).toBe(1);
    }

    a.issues.undo(); // one step restores all three priors
    await world.settle();
    for (const [index, issue] of targets.entries()) {
      expect(a.issues.issue(TEAM, issue.id)!.priority).toBe(priorPriorities[index]);
    }
    await world.close();
  });

  test('undo of create archives (soft-delete doctrine); redo unarchives', async () => {
    const world = await makeWorld();
    const a = await primedSession(world, 'web_i');

    const issueId = a.issues.create(TEAM, draft);
    await world.settle();
    expect(a.issues.issue(TEAM, issueId)!.archivedAt).toBeNull();

    a.issues.undo();
    await world.settle();
    // Not gone — archived, recoverable.
    expect(a.issues.issue(TEAM, issueId)).toBeDefined();
    expect(a.issues.issue(TEAM, issueId)!.archivedAt).not.toBeNull();

    a.issues.redo();
    await world.settle();
    expect(a.issues.issue(TEAM, issueId)!.archivedAt).toBeNull();
    await world.close();
  });

  test('hard delete of a non-archived issue is rejected server-side', async () => {
    const world = await makeWorld();
    const a = await primedSession(world, 'web_j');

    const target = a.issues.issuesIn(TEAM, TODO_STATE)[0];
    const handle = a.issues.hardDelete([target.id]);
    const info = await handle.settled;
    await world.settle();
    expect(info.state).toBe('rejected');
    expect(info.rejection?.code).toBe('not-archived');
    // Rolled back: still there.
    expect(a.issues.issue(TEAM, target.id)).toBeDefined();
    await world.close();
  });
});
