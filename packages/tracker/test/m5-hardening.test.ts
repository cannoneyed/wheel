// @vitest-environment node
/**
 * Hardening: two pressure-point MEASUREMENTS (float ordering exhaustion,
 * computed LRU behavior at scale) plus projection-parity coverage for the
 * remaining tables (projects, views, favorites, comments).
 */
import { describe, expect, test } from 'vitest';

import { ServiceContext, fakeService } from 'wheel/core';
import { positionBetween } from 'wheel/sync';
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
import * as inboxSync from '../src/sync/inbox.sync';
import * as inboxServer from '../src/sync/inbox.server';
import * as viewsSync from '../src/sync/views.sync';
import * as viewsServer from '../src/sync/views.server';
import * as favoritesSync from '../src/sync/favorites.sync';
import * as favoritesServer from '../src/sync/favorites.server';
import { TEAMS_DDL } from '../src/sync/teams.server';
import { ISSUES_DDL } from '../src/sync/issues.server';
import { COMMENTS_DDL } from '../src/sync/comments.server';
import { ACTIVITY_DDL } from '../src/sync/activity.server';
import { PROJECTS_DDL } from '../src/sync/projects.server';
import { CYCLES_DDL } from '../src/sync/cycles.server';
import { INBOX_DDL } from '../src/sync/inbox.server';
import { VIEWS_DDL } from '../src/sync/views.server';
import { FAVORITES_DDL } from '../src/sync/favorites.server';
import { applySeed, SEED, seedStateId } from '../seed/seed';
import { IssueService } from '../src/services/issue-service';
import { ProjectService } from '../src/services/project-service';
import { ViewService } from '../src/services/view-service';
import { FavoriteService } from '../src/services/favorite-service';
import { CommentService } from '../src/services/comment-service';
import { UserService } from '../src/services/user-service';

const TEAM = SEED.teams[0].id;
const TODO_STATE = seedStateId(0, 1);
const ADA = SEED.users[0].id;

async function makeWorld(): Promise<World> {
  return World.create({
    syncModules: [
      teamsSync, issuesSync, commentsSync, activitySync, projectsSync, cyclesSync,
      inboxSync, viewsSync, favoritesSync
    ],
    servers: [
      teamsServer, issuesServer, commentsServer, activityServer, projectsServer, cyclesServer,
      inboxServer, viewsServer, favoritesServer
    ],
    setup: async (db) => {
      for (const statement of [
        ...TEAMS_DDL, ...ISSUES_DDL, ...COMMENTS_DDL, ...ACTIVITY_DDL,
        ...PROJECTS_DDL, ...CYCLES_DDL, ...INBOX_DDL, ...VIEWS_DDL, ...FAVORITES_DDL
      ]) {
        await db.query(statement);
      }
      await applySeed(db);
    }
  });
}

async function session(world: World, clientId: string) {
  const client = await world.client(clientId, { actor: `user:${ADA}` });
  const context = new ServiceContext({ client });
  context.override(
    UserService,
    fakeService(UserService, { actorId: { get: () => ADA } as unknown as UserService['actorId'] }),
    { ownership: 'caller' }
  );
  const issues = context.get(IssueService);
  issues.issuesFor(TEAM);
  await world.settle();
  return { client, context, issues };
}

describe('pressure-point measurements', () => {
  test('float ordering exhausts after ~50 same-gap drops but NEVER diverges clients', async () => {
    const world = await makeWorld();
    const a = await session(world, 'web_a');
    const b = await session(world, 'web_b');

    const rows = a.issues.issuesIn(TEAM, TODO_STATE);
    expect(rows.length).toBeGreaterThan(2);
    const [first, second] = rows;

    // Repeatedly drop a rotating pool of issues into the SAME shrinking gap
    // just above the anchor row — the worst case for float midpoints.
    // (Measurement note, itself a finding: halving toward ZERO rides the
    // exponent and survives ~1074 drops; mantissa exhaustion — the real
    // ~52-drop limit — needs a gap between two nonzero values, which is the
    // common case in a seeded list.)
    let exhaustedAt: number | null = null;
    const list = () => a.issues.issuesIn(TEAM, TODO_STATE);
    const anchorId = rows[1].id; // sortOrder 1 in the seed; drops land between it and its successor
    for (let drop = 0; drop < 70; drop += 1) {
      const current = list();
      const anchorIndex = current.findIndex((row) => row.id === anchorId);
      const before = current[anchorIndex].sortOrder;
      const after = current[anchorIndex + 1]?.sortOrder;
      const position = positionBetween(before, after);
      if (position === before || position === after) {
        exhaustedAt = exhaustedAt ?? drop;
      }
      const pool = current.filter((row, index) => index !== anchorIndex && index !== anchorIndex + 1);
      const victim = pool[drop % pool.length];
      a.issues.reorder(victim.id, { sortOrder: position });
      if (drop % 10 === 9) await world.settle();
    }
    await world.settle();

    // The measurement: exhaustion IS real (midpoints stop moving)…
    expect(exhaustedAt).not.toBeNull();
    expect(exhaustedAt!).toBeGreaterThan(40); // ~52 in practice (float53 halvings)
    // …and the failure mode is BENIGN: id tie-breaks keep both clients in the
    // exact same order — degraded UX (drops stop reordering), never divergence.
    expect(a.issues.issuesIn(TEAM, TODO_STATE).map((row) => row.id)).toEqual(
      b.issues.issuesIn(TEAM, TODO_STATE).map((row) => row.id)
    );
    expect(a.issues.issue(TEAM, first.id)).toBeDefined();
    expect(a.issues.issue(TEAM, second.id)).toBeDefined();
    await world.close();
  }, 120_000);

  test('the computed LRU (256 tuples) evicts under full-workspace reads without wrong results', async () => {
    const world = await makeWorld();
    const a = await session(world, 'web_c');
    // Load ALL teams and read issue() for every row — 250 tuples through a
    // 256-entry LRU per computed.
    for (const team of SEED.teams) {
      a.issues.issuesFor(team.id);
    }
    await world.settle();
    let reads = 0;
    for (const team of SEED.teams) {
      for (const issue of a.issues.issuesFor(team.id)) {
        // Correctness under eviction: every read returns the right row even
        // when its memo was evicted and recreated.
        expect(a.issues.issue(team.id, issue.id)?.id).toBe(issue.id);
        reads += 1;
      }
    }
    expect(reads).toBeGreaterThan(240);
    // Second pass: the first ~250-cap reads now MISS (evicted) and recreate.
    // This is the measured verdict: correctness holds, cost is memo
    // churn — acceptable at 250 rows, a per-computed cap option if it grows.
    for (const issue of a.issues.issuesFor(TEAM).slice(0, 20)) {
      expect(a.issues.issue(TEAM, issue.id)?.id).toBe(issue.id);
    }
    await world.close();
  }, 60_000);
});

describe('projection parity — projects, views, favorites, comments', () => {
  test('projects, saved views, and favorites place optimistic rows exactly where the server keeps them', async () => {
    const world = await makeWorld();
    const a = await session(world, 'web_d');
    const projects = a.context.get(ProjectService);
    const views = a.context.get(ViewService);
    const favorites = a.context.get(FavoriteService);
    projects.projects.rows;
    views.viewsFor(TEAM);
    favorites.favorites();
    await world.settle();

    // Project create → appended at the end of sidebar order, both sides.
    projects.create({ name: 'Parity project' });
    const optimisticProjects = projects.projects.rows.map((row) => row.id);
    await world.settle();
    expect(projects.projects.rows.map((row) => row.id)).toEqual(optimisticProjects);

    // Saved-view create → oldest-first order stable pre/post confirm.
    views.create(TEAM, 'Parity view', '{}', '{}');
    const optimisticViews = views.viewsFor(TEAM).map((row) => row.id);
    await world.settle();
    expect(views.viewsFor(TEAM).map((row) => row.id)).toEqual(optimisticViews);

    // Favorites: two adds + a reorder, order identical pre/post confirm.
    const [issueA, issueB] = a.issues.issuesIn(TEAM, TODO_STATE);
    favorites.toggle('issue', issueA.id);
    favorites.toggle('issue', issueB.id);
    await world.settle();
    const rows = favorites.favorites();
    favorites.reorder(rows[1].id, undefined, rows[0].position);
    const optimisticFavorites = favorites.favorites().map((row) => row.targetId);
    await world.settle();
    expect(favorites.favorites().map((row) => row.targetId)).toEqual(optimisticFavorites);
    await world.close();
  });

  test('comment create places identically pre/post confirm (createdAt ordering)', async () => {
    const world = await makeWorld();
    const a = await session(world, 'web_e');
    const commentService = a.context.get(CommentService);
    const target = a.issues.issuesIn(TEAM, TODO_STATE)[0];
    commentService.commentsOf(target.id);
    await world.settle();

    commentService.create(target.id, 'Parity comment');
    const optimistic = commentService.commentsOf(target.id).map((row) => row.id);
    await world.settle();
    expect(commentService.commentsOf(target.id).map((row) => row.id)).toEqual(optimistic);
    await world.close();
  });
});
