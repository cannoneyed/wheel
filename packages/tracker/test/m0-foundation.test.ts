// @vitest-environment node
/**
 * Foundation test: the World boots on the real seed, teams/users/states
 * converge to two clients, and team settings edits round-trip with undo.
 */
import { describe, expect, test } from 'vitest';

import { ServiceContext } from 'wheel/core';
import { World } from 'wheel/testing';
import * as teamsSync from '../src/sync/teams.sync';
import * as teamsServer from '../src/sync/teams.server';
import { TEAMS_DDL } from '../src/sync/teams.server';
import { ISSUES_DDL } from '../src/sync/issues.server';
import { COMMENTS_DDL } from '../src/sync/comments.server';
import { ACTIVITY_DDL } from '../src/sync/activity.server';
import { PROJECTS_DDL } from '../src/sync/projects.server';
import { CYCLES_DDL } from '../src/sync/cycles.server';
import { INBOX_DDL } from '../src/sync/inbox.server';
import { applySeed, SEED } from '../seed/seed';
import { TeamService } from '../src/services/team-service';
import { buildUrl, matchUrl } from 'wheel/router';
import { tabOf, trackerRouter } from '../src/routes';

async function makeWorld(): Promise<World> {
  return World.create({
    syncModules: [teamsSync],
    servers: [teamsServer],
    setup: async (db) => {
      // The seed now covers labels/issues too, so their DDL comes along.
      for (const statement of [...TEAMS_DDL, ...ISSUES_DDL, ...COMMENTS_DDL, ...ACTIVITY_DDL, ...PROJECTS_DDL, ...CYCLES_DDL, ...INBOX_DDL])
        await db.query(statement);
      await applySeed(db);
    }
  });
}

describe('foundation', () => {
  test('seeded workspace converges to two clients through TeamService', async () => {
    const world = await makeWorld();
    const [a, b] = await world.twoClients('web_a', 'web_b');
    const serviceA = new ServiceContext({ client: a }).get(TeamService);
    const serviceB = new ServiceContext({ client: b }).get(TeamService);
    await a.subscribe(teamsSync.teamsAll, {});
    await a.subscribe(teamsSync.usersAll, {});
    await b.subscribe(teamsSync.teamsAll, {});
    await world.settle();

    expect(serviceA.teams().map((team) => team.key)).toEqual(['ENG', 'DES', 'OPS']);
    expect(serviceA.users().length).toBe(SEED.users.length);
    expect(serviceB.teams().length).toBe(3);
    await world.close();
  });

  test('team settings edit is optimistic, converges, and undoes cross-client', async () => {
    const world = await makeWorld();
    const [a, b] = await world.twoClients('web_c', 'web_d');
    const serviceA = new ServiceContext({ client: a }).get(TeamService);
    const serviceB = new ServiceContext({ client: b }).get(TeamService);
    await a.subscribe(teamsSync.teamsAll, {});
    await b.subscribe(teamsSync.teamsAll, {});
    await world.settle();

    const eng = SEED.teams[0].id;
    serviceA.update(eng, { name: 'Engineering Platform' });
    expect(serviceA.team(eng)?.name).toBe('Engineering Platform'); // optimistic
    await world.settle();
    expect(serviceB.team(eng)?.name).toBe('Engineering Platform'); // converged

    a.undo();
    await world.settle();
    expect(serviceA.team(eng)?.name).toBe('Engineering');
    expect(serviceB.team(eng)?.name).toBe('Engineering'); // undo synced
    await world.close();
  });

  test('per-team states subscribe independently and are position-ordered', async () => {
    const world = await makeWorld();
    const client = await world.client('web_e');
    const service = new ServiceContext({ client }).get(TeamService);
    // First read PRIMES the lazy per-team subscription; settle() awaits it.
    service.states(SEED.teams[0].id);
    await world.settle();
    expect(service.states(SEED.teams[0].id).length).toBe(6);
    expect(service.states(SEED.teams[0].id).map((state) => state.name)).toEqual([
      'Backlog',
      'Todo',
      'In Progress',
      'In Review',
      'Done',
      'Canceled'
    ]);
    await world.close();
  });

  test('routing: every URL shape round-trips through the table (headless)', () => {
    const table = trackerRouter.table;
    const urls = [
      '/',
      '/inbox',
      '/my-issues',
      '/teams/team_x/issues',
      '/teams/team_x/board',
      '/teams/team_x/cycles',
      '/teams/team_x/projects',
      '/issues/issue_x',
      '/projects/project_x'
    ];
    for (const url of urls) {
      const match = matchUrl(table, url);
      expect(match, url).not.toBeNull();
      expect(buildUrl(table, match!.name, { params: match!.params }), url).toBe(url);
    }
    // A URL naming nothing in the table reports no match rather than throwing;
    // the shell renders its not-found component.
    expect(matchUrl(table, '/garbage/xyz')).toBeNull();
    expect(matchUrl(table, '/teams/team_x/bogus')).toBeNull();
  });

  test('routing: tabOf reads the tab segment out of every team route name', () => {
    const table = trackerRouter.table;
    const tabs = [
      ['/teams/team_x/issues', 'issues'],
      ['/teams/team_x/board', 'board'],
      ['/teams/team_x/cycles', 'cycles'],
      ['/teams/team_x/projects', 'projects']
    ] as const;
    for (const [url, tab] of tabs) {
      expect(tabOf(matchUrl(table, url)!.name), url).toBe(tab);
    }
    // Non-team routes fall back to the issues tab.
    expect(tabOf(matchUrl(table, '/inbox')!.name)).toBe('issues');
    expect(tabOf(null)).toBe('issues');
  });
});
