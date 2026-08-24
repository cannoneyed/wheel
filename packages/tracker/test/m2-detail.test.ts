// @vitest-environment node
/**
 * Detail-pane tests: comments (author-only enforcement, undoable delete),
 * server-authored activity (+ the 50-entry cap), presence set/clear, the
 * orphaned-mutation path, sub-issue cycle rejection, and relations.
 */
import { describe, expect, test, vi } from 'vitest';

import { ServiceContext, fakeService } from 'wheel/core';
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
import { IssueService } from '../src/services/issue-service';
import { TeamService } from '../src/services/team-service';
import { CommentService } from '../src/services/comment-service';
import { ActivityService } from '../src/services/activity-service';
import { PresenceService } from '../src/services/presence-service';
import { ToastService } from 'wheel/kit';
import { UserService } from '../src/services/user-service';

const TEAM = SEED.teams[0].id;
const TODO_STATE = seedStateId(0, 1);
const ADA = SEED.users[0].id;
const GRACE = SEED.users[1].id;

async function makeWorld(): Promise<World> {
  return World.create({
    syncModules: [teamsSync, issuesSync, commentsSync, activitySync],
    servers: [teamsServer, issuesServer, commentsServer, activityServer],
    setup: async (db) => {
      for (const statement of [...TEAMS_DDL, ...ISSUES_DDL, ...COMMENTS_DDL, ...ACTIVITY_DDL, ...PROJECTS_DDL, ...CYCLES_DDL, ...INBOX_DDL]) {
        await db.query(statement);
      }
      await applySeed(db);
    }
  });
}

interface Session {
  client: Awaited<ReturnType<World['client']>>;
  context: ServiceContext;
  issues: IssueService;
  comments: CommentService;
}

async function primedSession(world: World, clientId: string, userId: string): Promise<Session> {
  const client = await world.client(clientId, { actor: `user:${userId}` });
  const context = new ServiceContext({ client });
  // The real UserService reads sessionStorage; tests pin the actor directly.
  context.override(
    UserService,
    fakeService(UserService, { actorId: { get: () => userId } as unknown as UserService['actorId'] }),
    { ownership: 'caller' }
  );
  const issues = context.get(IssueService);
  const comments = context.get(CommentService);
  issues.issuesFor(TEAM);
  await world.settle(); // settle() awaits the lazy subscribe it just primed
  expect(issues.issuesFor(TEAM).length).toBeGreaterThan(0);
  return { client, context, issues, comments };
}

/** Prime a lazy subscription; settle() awaits it landing. */
async function primed<T>(world: World, read: () => readonly T[], min = 0): Promise<void> {
  read();
  await world.settle();
  expect(read().length).toBeGreaterThanOrEqual(min);
}

describe('detail pane', () => {
  test('comments converge; only the author can edit (typed forbidden + rollback)', async () => {
    const world = await makeWorld();
    const ada = await primedSession(world, 'web_a', ADA);
    const grace = await primedSession(world, 'web_b', GRACE);
    const issue = ada.issues.issuesIn(TEAM, TODO_STATE)[0];

    await primed(world, () => ada.comments.commentsOf(issue.id));
    await primed(world, () => grace.comments.commentsOf(issue.id));
    const before = ada.comments.commentsOf(issue.id).length;

    // The World's fixed clock (2023 epoch) sorts test comments BEFORE the
    // 2026 seed comments — find by body, never by position.
    ada.comments.create(issue.id, 'A note from Ada.');
    await world.settle();
    expect(grace.comments.commentsOf(issue.id).length).toBe(before + 1);
    const byId = () => grace.comments.commentsOf(issue.id).find((row) => row.id === comment.id)!;
    const comment = grace.comments.commentsOf(issue.id).find((row) => row.body === 'A note from Ada.')!;
    expect(comment.authorId).toBe(ADA);
    expect(grace.comments.isOwn(issue.id, comment.id)).toBe(false);

    // Grace tries to edit Ada's comment: optimistic applies, server rejects, rollback.
    const handle = grace.comments.edit(comment.id, 'Grace was here');
    expect(byId().body).toBe('Grace was here');
    const info = await handle.settled;
    await world.settle();
    expect(info.state).toBe('rejected');
    expect(info.rejection?.code).toBe('forbidden');
    expect(byId().body).toBe('A note from Ada.');

    // Ada edits her own: sticks.
    ada.comments.edit(comment.id, 'A clarified note.');
    await world.settle();
    expect(byId().body).toBe('A clarified note.');
    expect(byId().editedAt).not.toBeNull();
    await world.close();
  });

  test('comment delete undoes to a byte-identical restore', async () => {
    const world = await makeWorld();
    const ada = await primedSession(world, 'web_c', ADA);
    const issue = ada.issues.issuesIn(TEAM, TODO_STATE)[0];
    await primed(world, () => ada.comments.commentsOf(issue.id));

    ada.comments.create(issue.id, 'Ephemeral thought.');
    await world.settle();
    const created = ada.comments.commentsOf(issue.id).find((row) => row.body === 'Ephemeral thought.')!;

    ada.comments.remove(created.id);
    await world.settle();
    expect(ada.comments.commentsOf(issue.id).find((c) => c.id === created.id)).toBeUndefined();

    ada.client.undo();
    await world.settle();
    const restored = ada.comments.commentsOf(issue.id).find((c) => c.id === created.id);
    expect(restored).toBeDefined();
    expect(restored!.body).toBe('Ephemeral thought.');
    expect(restored!.createdAt).toBe(created.createdAt);
    await world.close();
  });

  test('activity is server-authored and hard-capped at 50 entries', async () => {
    const world = await makeWorld();
    const ada = await primedSession(world, 'web_d', ADA);
    const activityService = ada.context.get(ActivityService);

    // A fresh issue starts with exactly one 'created' entry.
    const issueId = ada.issues.create(TEAM, {
      title: 'Activity probe',
      description: '',
      stateId: TODO_STATE,
      priority: 0,
      assigneeId: null,
      estimate: null,
      dueDate: null,
      labelIds: []
    });
    await world.settle();
    await primed(world, () => activityService.feedOf(issueId), 1);
    expect(activityService.feedOf(issueId).map((entry) => entry.kind)).toEqual(['created']);

    // 55 renames → 56 entries server-side → the query returns exactly the newest 50.
    for (let index = 0; index < 55; index += 1) {
      ada.issues.update(issueId, { title: `Rename ${index}` });
    }
    await world.settle();
    await vi.waitFor(async () => {
      await world.settle();
      expect(activityService.feedOf(issueId).length).toBe(50);
    });
    const feed = activityService.feedOf(issueId);
    expect(feed[0].kind).toBe('renamed');
    expect(feed[0].detail).toBe('Rename 54'); // newest first
    expect(feed.every((entry) => entry.kind === 'renamed')).toBe(true); // 'created' fell off
    await world.close();
  });

  test('presence: viewing appears to peers and clears on leave; typing flags', async () => {
    const world = await makeWorld();
    const ada = await primedSession(world, 'web_e', ADA);
    const grace = await primedSession(world, 'web_f', GRACE);
    const issue = ada.issues.issuesIn(TEAM, TODO_STATE)[0];
    const adaPresence = ada.context.get(PresenceService);
    const gracePresence = grace.context.get(PresenceService);

    gracePresence.setViewing(issue.id);
    await world.settle();
    expect(adaPresence.viewers(issue.id)).toEqual([GRACE]);
    expect(adaPresence.typers(issue.id)).toEqual([]);

    gracePresence.setTyping(true);
    await world.settle();
    expect(adaPresence.typers(issue.id)).toEqual([GRACE]);

    gracePresence.setViewing(null);
    await world.settle();
    expect(adaPresence.viewers(issue.id)).toEqual([]);
    await world.close();
  });

  test('pending edit to an issue deleted elsewhere lands loud (rejected/orphaned), never silent', async () => {
    const world = await makeWorld();
    const ada = await primedSession(world, 'web_g', ADA);
    const grace = await primedSession(world, 'web_h', GRACE);
    const toasts = ada.context.get(ToastService);
    const target = ada.issues.issuesIn(TEAM, TODO_STATE)[0];

    // Ada goes offline and edits; Grace archives + hard-deletes the issue.
    world.network.pause('web_g');
    const handle = ada.issues.update(target.id, { title: 'Edit into the void' });
    grace.issues.archive([target.id]);
    await world.settle();
    grace.issues.hardDelete([target.id]);
    await world.settle();
    expect(grace.issues.issue(TEAM, target.id)).toBeUndefined();

    world.network.resume('web_g');
    const info = await handle.settled;
    await vi.waitFor(async () => {
      await world.settle();
      expect(ada.issues.issue(TEAM, target.id)).toBeUndefined();
    });
    // Loud, terminal, never limbo — and surfaced as a toast.
    expect(['rejected', 'orphaned']).toContain(info.state);
    await vi.waitFor(() => {
      expect(toasts.toasts.get().length).toBeGreaterThan(0);
    });
    await world.close();
  });

  test('sub-issues: parent cycle is rejected; progress counts completed children', async () => {
    const world = await makeWorld();
    const ada = await primedSession(world, 'web_i', ADA);
    const [a, b] = ada.issues.issuesIn(TEAM, TODO_STATE);

    ada.issues.setParent(b.id, a.id);
    await world.settle();
    expect(ada.issues.issue(TEAM, b.id)!.parentId).toBe(a.id);
    expect(ada.issues.childrenOf(TEAM, a.id).some((child) => child.id === b.id)).toBe(true);

    // a → b would close the loop.
    const handle = ada.issues.setParent(a.id, b.id);
    const info = await handle.settled;
    await world.settle();
    expect(info.state).toBe('rejected');
    expect(info.rejection?.code).toBe('cycle');
    expect(ada.issues.issue(TEAM, a.id)!.parentId).toBeNull();

    // Completing b moves progress to 1/1. subProgress reads the team's
    // workflow states — prime that lazy subscription first.
    const teamService = ada.context.get(TeamService);
    await primed(world, () => teamService.states(TEAM), 6);
    const doneState = seedStateId(0, 4);
    ada.issues.moveToState(TEAM, b.id, doneState);
    await world.settle();
    expect(ada.issues.subProgress(TEAM, a.id)).toEqual({ done: 1, total: 1 });
    await world.close();
  });

  test('relations: add converges, remove undoes back', async () => {
    const world = await makeWorld();
    const ada = await primedSession(world, 'web_j', ADA);
    const grace = await primedSession(world, 'web_k', GRACE);
    const [a, b] = ada.issues.issuesIn(TEAM, TODO_STATE);
    await primed(world, () => ada.issues.relationsOf(TEAM, a.id));
    await primed(world, () => grace.issues.relationsOf(TEAM, a.id));
    const baseline = ada.issues.relationsOf(TEAM, a.id).length;

    ada.issues.addRelation(TEAM, a.id, b.id, 'blocks');
    await world.settle();
    expect(grace.issues.relationsOf(TEAM, a.id).length).toBe(baseline + 1);
    expect(grace.issues.blockedBy(TEAM, b.id)).toContain(a.id);

    const relation = ada.issues
      .relationsOf(TEAM, a.id)
      .find((row) => row.relatedId === b.id && row.kind === 'blocks')!;
    ada.issues.removeRelation(relation.id);
    await world.settle();
    expect(grace.issues.blockedBy(TEAM, b.id)).not.toContain(a.id);

    ada.client.undo(); // undo the removal → relation returns everywhere
    await world.settle();
    expect(grace.issues.blockedBy(TEAM, b.id)).toContain(a.id);
    await world.close();
  });
});
