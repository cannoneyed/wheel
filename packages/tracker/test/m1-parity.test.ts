// @vitest-environment node
/**
 * Projection parity: for every issue mutation, the OPTIMISTIC row order must
 * equal the CONFIRMED row order — zero reorders when server truth replaces
 * the client's guess. Wheel's generic parity helper drives the assertion.
 */
import { describe, expect, test } from 'vitest';

import { ServiceContext } from 'wheel/core';
import { World, expectMutationParity } from 'wheel/testing';

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
import { applySeed, SEED, SEED_WORKSPACE_LABELS, seedStateId } from '../seed/seed';
import { IssueService } from '../src/services/issue-service';

const TEAM = SEED.teams[0].id;
const TODO_STATE = seedStateId(0, 1);
const REVIEW_STATE = seedStateId(0, 3);

async function primedWorld(): Promise<{ world: World; issues: IssueService }> {
  const world = await World.create({
    syncModules: [teamsSync, issuesSync, commentsSync, activitySync],
    servers: [teamsServer, issuesServer, commentsServer, activityServer],
    setup: async (db) => {
      for (const statement of [...TEAMS_DDL, ...ISSUES_DDL, ...COMMENTS_DDL, ...ACTIVITY_DDL, ...PROJECTS_DDL, ...CYCLES_DDL, ...INBOX_DDL])
        await db.query(statement);
      await applySeed(db);
    }
  });
  const client = await world.client('web_parity');
  const issues = new ServiceContext({ client }).get(IssueService);
  issues.issuesFor(TEAM);
  issues.labelIdsOf(TEAM, 'prime');
  await world.settle(); // settle() awaits the lazy subscribes it just primed
  expect(issues.issuesFor(TEAM).length).toBeGreaterThan(0);
  return { world, issues };
}

/**
 * Run a mutation and assert the full-team row order is byte-identical before
 * and after server confirmation.
 */
async function expectOrderParity(
  world: World,
  issues: IssueService,
  mutate: () => void
): Promise<void> {
  await expectMutationParity({
    world,
    mutate,
    read: () => issues.issuesFor(TEAM).map((row) => row.id)
  });
}

describe('projection parity', () => {
  test('create lands where the server will keep it', async () => {
    const { world, issues } = await primedWorld();
    await expectOrderParity(world, issues, () => {
      issues.create(TEAM, {
        title: 'Parity create',
        description: '',
        stateId: TODO_STATE,
        priority: 3,
        assigneeId: null,
        estimate: null,
        dueDate: null,
        labelIds: [SEED_WORKSPACE_LABELS[0].id]
      });
    });
    await world.close();
  });

  test('update (no order key touched) keeps order', async () => {
    const { world, issues } = await primedWorld();
    const target = issues.issuesIn(TEAM, TODO_STATE)[0];
    await expectOrderParity(world, issues, () => {
      issues.update(target.id, { title: 'Parity title', priority: 1 });
    });
    await world.close();
  });

  test('moveToState places identically pre/post confirm', async () => {
    const { world, issues } = await primedWorld();
    const target = issues.issuesIn(TEAM, TODO_STATE)[0];
    await expectOrderParity(world, issues, () => {
      issues.moveToState(TEAM, target.id, REVIEW_STATE);
    });
    await world.close();
  });

  test('reorder (sortOrder between neighbors) is stable', async () => {
    const { world, issues } = await primedWorld();
    const rows = issues.issuesIn(TEAM, TODO_STATE);
    expect(rows.length).toBeGreaterThan(2);
    // Move the first row between rows 1 and 2.
    const between = (rows[1].sortOrder + rows[2].sortOrder) / 2;
    await expectOrderParity(world, issues, () => {
      issues.reorder(rows[0].id, { sortOrder: between });
    });
    await world.close();
  });

  test('archive + unarchive keep query order (archived rows stay in the query)', async () => {
    const { world, issues } = await primedWorld();
    const target = issues.issuesIn(TEAM, TODO_STATE)[1];
    await expectOrderParity(world, issues, () => issues.archive([target.id]));
    await expectOrderParity(world, issues, () => issues.unarchive([target.id]));
    await world.close();
  });

  test('bulkUpdate keeps order', async () => {
    const { world, issues } = await primedWorld();
    const targets = issues.issuesIn(TEAM, TODO_STATE).slice(0, 3);
    await expectOrderParity(world, issues, () => {
      issues.bulkUpdate(targets.map((row) => row.id), { assigneeId: SEED.users[2].id });
    });
    await world.close();
  });

  test('label add/remove converge in the join projection', async () => {
    const { world, issues } = await primedWorld();
    const target = issues.issuesIn(TEAM, TODO_STATE)[0];
    const label = SEED_WORKSPACE_LABELS[1];

    issues.addLabel(TEAM, target.id, label.id);
    const optimistic = [...issues.labelIdsOf(TEAM, target.id)];
    expect(optimistic).toContain(label.id);
    await world.settle();
    expect([...issues.labelIdsOf(TEAM, target.id)]).toEqual(optimistic);

    issues.removeLabel(TEAM, target.id, label.id);
    const afterRemove = [...issues.labelIdsOf(TEAM, target.id)];
    expect(afterRemove).not.toContain(label.id);
    await world.settle();
    expect([...issues.labelIdsOf(TEAM, target.id)]).toEqual(afterRemove);
    await world.close();
  });
});
