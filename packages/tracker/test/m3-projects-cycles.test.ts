// @vitest-environment node
/**
 * Projects & cycles: derived collections recompute through declared dependencies, the
 * rollover job's externalWrite reaches subscribed clients, and project flows
 * (create/assign/delete-unassigns) converge. Written without any
 * subscription polling — settle() covers lazy subscribes.
 */
import { describe, expect, test } from 'vitest';

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
import * as projectsSync from '../src/sync/projects.sync';
import * as projectsServer from '../src/sync/projects.server';
import * as cyclesSync from '../src/sync/cycles.sync';
import * as cyclesServer from '../src/sync/cycles.server';
import { TEAMS_DDL } from '../src/sync/teams.server';
import { ISSUES_DDL } from '../src/sync/issues.server';
import { COMMENTS_DDL } from '../src/sync/comments.server';
import { ACTIVITY_DDL } from '../src/sync/activity.server';
import { PROJECTS_DDL } from '../src/sync/projects.server';
import { CYCLES_DDL } from '../src/sync/cycles.server';
import { INBOX_DDL } from '../src/sync/inbox.server';
import { applySeed, SEED, SEED_PROJECTS, seedCycleId, seedStateId } from '../seed/seed';
import { runCycleRollover } from '../jobs/rollover';
import { IssueService } from '../src/services/issue-service';
import { ProjectService } from '../src/services/project-service';
import { CycleService } from '../src/services/cycle-service';

const TEAM = SEED.teams[0].id;
const TODO_STATE = seedStateId(0, 1);
const DONE_STATE = seedStateId(0, 4);
// The seed's cycle 2 ends one week after SEED_NOW (1_752_800_000_000); this
// "now" is safely after that, so cycle 2 itself has also ended.
const AFTER_CYCLE_2 = 1_752_800_000_000 + 30 * 86_400_000;

async function makeWorld(): Promise<World> {
  return World.create({
    syncModules: [teamsSync, issuesSync, commentsSync, activitySync, projectsSync, cyclesSync],
    servers: [teamsServer, issuesServer, commentsServer, activityServer, projectsServer, cyclesServer],
    setup: async (db) => {
      for (const statement of [
        ...TEAMS_DDL,
        ...ISSUES_DDL,
        ...COMMENTS_DDL,
        ...ACTIVITY_DDL,
        ...PROJECTS_DDL,
        ...CYCLES_DDL,
        ...INBOX_DDL
      ]) {
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
  projects: ProjectService;
  cycles: CycleService;
}

async function primedSession(world: World, clientId: string): Promise<Session> {
  const client = await world.client(clientId);
  const context = new ServiceContext({ client });
  const issues = context.get(IssueService);
  const projects = context.get(ProjectService);
  const cycles = context.get(CycleService);
  // One read each primes the lazy subscriptions; ONE settle covers them all.
  issues.issuesFor(TEAM);
  projects.projects.rows;
  cycles.cyclesFor(TEAM);
  await world.settle();
  expect(issues.issuesFor(TEAM).length).toBeGreaterThan(0);
  return { client, context, issues, projects, cycles };
}

describe('projects & cycles', () => {
  test('seed state: 4 projects, 2 cycles per team, assignments landed', async () => {
    const world = await makeWorld();
    const session = await primedSession(world, 'web_a');
    expect(session.projects.projects.rows.length).toBe(SEED_PROJECTS.length);
    expect(session.cycles.cyclesFor(TEAM).map((cycle) => cycle.number)).toEqual([2, 1]);
    expect(session.issues.issuesFor(TEAM).some((issue) => issue.projectId !== null)).toBe(true);
    expect(session.issues.issuesFor(TEAM).some((issue) => issue.cycleId !== null)).toBe(true);
    await world.close();
  });

  test('project_counts recomputes when an issue completes through declared dependencies', async () => {
    const world = await makeWorld();
    const session = await primedSession(world, 'web_b');
    const projectId = SEED_PROJECTS[0].id;

    // Put a fresh Todo issue into the project, then complete it.
    const target = session.issues.issuesIn(TEAM, TODO_STATE).find((issue) => issue.projectId === null)!;
    session.issues.update(target.id, { projectId });
    await world.settle();
    const before = session.projects.progress(projectId);
    expect(before.total).toBeGreaterThan(0);

    session.issues.moveToState(TEAM, target.id, DONE_STATE);
    await world.settle();
    const after = session.projects.progress(projectId);
    // No physical table was written for project_counts — the delta arrived
    // purely because its query watches `issues`.
    expect(after.completed).toBe(before.completed + 1);
    expect(after.total).toBe(before.total);
    await world.close();
  });

  test('cycle_stats derived collection tracks scope and completion per cycle', async () => {
    const world = await makeWorld();
    const session = await primedSession(world, 'web_c');
    const activeCycle = seedCycleId(0, 2);

    // Prime the stats subscription BEFORE capturing the baseline.
    session.cycles.statsOf(TEAM, activeCycle);
    await world.settle();
    const target = session.issues.issuesIn(TEAM, TODO_STATE).find((issue) => issue.cycleId === null)!;
    const before = session.cycles.statsOf(TEAM, activeCycle);
    session.issues.update(target.id, { cycleId: activeCycle });
    await world.settle();
    expect(session.cycles.statsOf(TEAM, activeCycle).scope).toBe(before.scope + 1);

    session.issues.moveToState(TEAM, target.id, DONE_STATE);
    await world.settle();
    expect(session.cycles.statsOf(TEAM, activeCycle).completed).toBe(before.completed + 1);
    await world.close();
  });

  test('rollover: externalWrite moves unfinished issues into a NEW cycle and reaches every client', async () => {
    const world = await makeWorld();
    const a = await primedSession(world, 'web_d');
    const b = await primedSession(world, 'web_e');

    const beforeCycles = a.cycles.cyclesFor(TEAM).length;
    const unfinishedInOld = a.issues
      .activeFor(TEAM)
      .filter(
        (issue) =>
          issue.cycleId !== null &&
          ![DONE_STATE, seedStateId(0, 5)].includes(issue.stateId)
      ).length;
    expect(unfinishedInOld).toBeGreaterThan(0);

    // The out-of-engine job: direct SQL + one externalWrite. Both seed cycles
    // have ended at AFTER_CYCLE_2, so a NEW cycle 3 must be created.
    const report = await runCycleRollover({ db: world.db, server: world.server, now: AFTER_CYCLE_2 });
    expect(report.createdCycles).toBeGreaterThan(0);
    expect(report.rolledIssues).toBeGreaterThan(0);
    await world.settle();

    // Both clients see the new cycle…
    for (const session of [a, b]) {
      const cycles = session.cycles.cyclesFor(TEAM);
      expect(cycles.length).toBeGreaterThan(beforeCycles);
      const newest = cycles[0];
      expect(newest.number).toBe(3);
      // …and every unfinished ENG issue now sits in it.
      const stillInOld = session.issues
        .activeFor(TEAM)
        .filter(
          (issue) =>
            issue.cycleId !== null &&
            issue.cycleId !== newest.id &&
            ![DONE_STATE, seedStateId(0, 5)].includes(issue.stateId)
        );
      expect(stillInOld).toEqual([]);
    }

    // Idempotent: running again at the same time rolls nothing.
    const again = await runCycleRollover({ db: world.db, server: world.server, now: AFTER_CYCLE_2 });
    expect(again.rolledIssues).toBe(0);
    expect(again.createdCycles).toBe(0);
    await world.close();
  });

  test('project create → assign → delete-unassigns converges (and create/delete undo)', async () => {
    const world = await makeWorld();
    const a = await primedSession(world, 'web_f');
    const b = await primedSession(world, 'web_g');

    const projectId = a.projects.create({ name: 'Latency budget' });
    await world.settle();
    expect(b.projects.project(projectId)?.name).toBe('Latency budget');

    const issue = a.issues.issuesIn(TEAM, TODO_STATE)[0];
    a.issues.update(issue.id, { projectId });
    await world.settle();
    expect(b.issues.issue(TEAM, issue.id)?.projectId).toBe(projectId);
    expect(b.projects.progress(projectId).total).toBe(1);

    a.projects.remove(projectId);
    await world.settle();
    expect(b.projects.project(projectId)).toBeUndefined();
    // Server-side unassign reached everyone (delete's documented behavior).
    expect(b.issues.issue(TEAM, issue.id)?.projectId).toBeNull();

    a.client.undo(); // restores the project row (not the assignments)
    await world.settle();
    expect(b.projects.project(projectId)?.name).toBe('Latency budget');
    expect(b.issues.issue(TEAM, issue.id)?.projectId).toBeNull();
    await world.close();
  });
});
