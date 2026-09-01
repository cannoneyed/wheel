// @vitest-environment node
/**
 * Fuzz suite: seeded weighted ops — creates, edits, moves, bulk
 * patches, archive/unarchive, labels, comments, undo/redo — across 3 clients
 * with built-in network chaos, then the engine's four invariants at
 * quiescence: convergence, seqContinuity, causesComplete, noOrphanOptimism.
 *
 * Same seed → same run, forever. A failing seed becomes a permanent
 * regression fixture (replayFixture). Defaults stay CI-push-sized; the
 * nightly CI job cranks FUZZ_SEEDS / FUZZ_STEPS (20 × 500).
 */
import { describe, expect, test } from 'vitest';

import { positionBetween, type SyncClient, type CollectionDecl } from 'wheel/sync';
import { simulate, type SimOp } from 'wheel/testing';

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
import { TEAMS_DDL } from '../src/sync/teams.server';
import { ISSUES_DDL } from '../src/sync/issues.server';
import { COMMENTS_DDL } from '../src/sync/comments.server';
import { ACTIVITY_DDL } from '../src/sync/activity.server';
import { PROJECTS_DDL } from '../src/sync/projects.server';
import { CYCLES_DDL } from '../src/sync/cycles.server';
import { INBOX_DDL } from '../src/sync/inbox.server';
import { applySeed, SEED, seedIssueId, seedStateId } from '../seed/seed';

const TEAM = SEED.teams[0].id;
const STATES = [0, 1, 2, 3, 4, 5].map((index) => seedStateId(0, index));
const COMMENT_ISSUE = seedIssueId(1);
const {
  issues, issueLabels, issuesByTeam, labelsForTeam, issueLabelsByTeam,
  issueCreate, issueUpdate, issueMove, issueReorder, issueArchive, issueUnarchive,
  issueBulkUpdate, issueAddLabel, issueRemoveLabel
} = issuesSync;
const { comments, commentsByIssue, commentCreate, commentEdit, commentDelete } = commentsSync;

/** Active (non-archived) ENG issues from one client's effective cache. */
function active(client: SyncClient) {
  return client.rows(issues).filter((row) => row.teamId === TEAM && row.archivedAt === null);
}

const OPS: SimOp[] = [
  {
    name: 'issue.create',
    weight: 2,
    run: ({ rng, clients }) => {
      const client = rng.pick(clients);
      const rows = active(client);
      const first = rows[0];
      client.mutate(issueCreate, {
        issueId: client.newId('issue'),
        teamId: TEAM,
        title: `fuzzed issue ${rng.int(100000)}`,
        description: '',
        stateId: rng.pick(STATES),
        priority: rng.int(5),
        assigneeId: rng.next() < 0.5 ? rng.pick(SEED.users).id : null,
        estimate: null,
        dueDate: null,
        parentId: null,
        sortOrder: positionBetween(undefined, first?.sortOrder as number | undefined),
        boardOrder: positionBetween(undefined, first?.boardOrder as number | undefined),
        labelIds: []
      });
    }
  },
  {
    name: 'issue.update',
    weight: 4,
    run: ({ rng, clients }) => {
      const client = rng.pick(clients);
      const rows = active(client);
      if (rows.length === 0) return;
      const target = rng.pick(rows);
      client.mutate(issueUpdate, {
        issueId: target.id as string,
        patch:
          rng.next() < 0.5
            ? { title: `retitled ${rng.int(100000)}` }
            : { priority: rng.int(5), assigneeId: rng.next() < 0.3 ? null : rng.pick(SEED.users).id }
      });
    }
  },
  {
    name: 'issue.move',
    weight: 3,
    run: ({ rng, clients }) => {
      const client = rng.pick(clients);
      const rows = active(client);
      if (rows.length === 0) return;
      const target = rng.pick(rows);
      client.mutate(issueMove, {
        issueId: target.id as string,
        stateId: rng.pick(STATES),
        sortOrder: rng.next() * 200 - 100,
        boardOrder: rng.next() * 200 - 100
      });
    }
  },
  {
    name: 'issue.reorder',
    weight: 3,
    run: ({ rng, clients }) => {
      const client = rng.pick(clients);
      const rows = active(client);
      if (rows.length < 2) return;
      const sorted = [...rows].sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number));
      const index = rng.int(sorted.length - 1);
      client.mutate(issueReorder, {
        issueId: rng.pick(sorted).id as string,
        sortOrder: positionBetween(sorted[index].sortOrder as number, sorted[index + 1].sortOrder as number)
      });
    }
  },
  {
    name: 'issue.archiveCycle',
    weight: 2,
    run: ({ rng, clients }) => {
      const client = rng.pick(clients);
      if (rng.next() < 0.6) {
        const rows = active(client);
        if (rows.length === 0) return;
        client.mutate(issueArchive, { issueIds: [rng.pick(rows).id as string] });
      } else {
        const archived = client
          .rows(issues)
          .filter((row) => row.teamId === TEAM && row.archivedAt !== null);
        if (archived.length === 0) return;
        client.mutate(issueUnarchive, { issueIds: [rng.pick(archived).id as string] });
      }
    }
  },
  {
    name: 'issue.bulk',
    run: ({ rng, clients }) => {
      const client = rng.pick(clients);
      const rows = active(client);
      if (rows.length < 3) return;
      const targets = [rng.pick(rows), rng.pick(rows), rng.pick(rows)];
      const priority = rng.int(5);
      client.mutate(issueBulkUpdate, {
        updates: [...new Set(targets.map((row) => row.id as string))].map((issueId) => ({
          issueId,
          patch: { priority }
        }))
      });
    }
  },
  {
    name: 'issue.editArchived (expects rejection)',
    run: ({ rng, clients }) => {
      const client = rng.pick(clients);
      const archived = client
        .rows(issues)
        .filter((row) => row.teamId === TEAM && row.archivedAt !== null);
      if (archived.length === 0) return;
      // The server rejects; rollback must keep every invariant intact.
      client.mutate(issueUpdate, { issueId: rng.pick(archived).id as string, patch: { title: 'doomed edit' } });
    }
  },
  {
    name: 'label.toggle',
    weight: 2,
    run: ({ rng, clients }) => {
      const client = rng.pick(clients);
      const rows = active(client);
      if (rows.length === 0) return;
      const issueId = rng.pick(rows).id as string;
      const labelId = 'label_0190b62e-0000-7000-8000-0000000000w1';
      const has = client
        .rows(issueLabels)
        .some((link) => link.issueId === issueId && link.labelId === labelId);
      client.mutate(has ? issueRemoveLabel : issueAddLabel, { issueId, labelId, teamId: TEAM });
    }
  },
  {
    name: 'comment.flow',
    weight: 2,
    run: ({ rng, clients }) => {
      const client = rng.pick(clients);
      const mine = client
        .rows(comments)
        .filter((row) => row.issueId === COMMENT_ISSUE && row.authorId === `sim-user`);
      const roll = rng.next();
      if (roll < 0.5 || mine.length === 0) {
        client.mutate(commentCreate, {
          commentId: client.newId('comment'),
          issueId: COMMENT_ISSUE,
          body: `fuzz comment ${rng.int(100000)}`
        });
      } else if (roll < 0.8) {
        client.mutate(commentEdit, { commentId: rng.pick(mine).id as string, body: `edited ${rng.int(1000)}` });
      } else {
        client.mutate(commentDelete, { commentId: rng.pick(mine).id as string });
      }
    }
  },
  {
    name: 'undo',
    weight: 2,
    run: ({ rng, clients }) => void rng.pick(clients).undo()
  },
  {
    name: 'redo',
    run: ({ rng, clients }) => void rng.pick(clients).redo()
  }
];

const SEEDS = (process.env.FUZZ_SEEDS ?? '11,22,33')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value));
const STEPS = Number(process.env.FUZZ_STEPS ?? 120);

describe('fuzz — four invariants across seeded chaos', () => {
  for (const seed of SEEDS) {
    test(`seed ${seed} × ${STEPS} steps × 3 clients converges`, async () => {
      const report = await simulate({
        seed,
        steps: STEPS,
        clientCount: 3,
        syncModules: [teamsSync, issuesSync, commentsSync, activitySync, projectsSync, cyclesSync, inboxSync],
        servers: [teamsServer, issuesServer, commentsServer, activityServer, projectsServer, cyclesServer, inboxServer],
        setup: async (db) => {
          for (const statement of [
            ...TEAMS_DDL, ...ISSUES_DDL, ...COMMENTS_DDL, ...ACTIVITY_DDL,
            ...PROJECTS_DDL, ...CYCLES_DDL, ...INBOX_DDL
          ]) {
            await db.query(statement);
          }
          await applySeed(db);
        },
        prepare: async (client) => {
          await client.subscribe(issuesByTeam, { teamId: TEAM });
          await client.subscribe(labelsForTeam, { teamId: TEAM });
          await client.subscribe(issueLabelsByTeam, { teamId: TEAM });
          await client.subscribe(commentsByIssue, { issueId: COMMENT_ISSUE });
        },
        ops: OPS,
        // CollectionDecl is invariant over its row type; the harness compares rows generically.
        collections: [issues, issueLabels, comments] as unknown as CollectionDecl[]
      });
      // The harness throws on any invariant violation; the report proves work happened.
      const mutations = Object.entries(report.opCounts)
        .filter(([name]) => name !== 'network.toggle')
        .reduce((sum, [, count]) => sum + count, 0);
      expect(mutations).toBeGreaterThan(STEPS / 2);
    }, 120_000);
  }
});
