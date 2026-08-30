// @vitest-environment node
/**
 * Phase 2 proof: run WheelMaterializer against Tracker's real issue, project,
 * aggregate, join-table, and grouped-update declarations. Production reads
 * remain on SyncClient until Phase 4.
 */
import { describe, expect, test } from 'vitest';

import {
  MemoryCache,
  SyncClient,
  type Infer,
  type MutateResult,
  type MutationDecl,
  type QueryDecl,
  type ServerEvent,
  type SyncTransport
} from 'wheel/sync';
import { fixedClock, seededRandomBytes, World } from 'wheel/testing';

import {
  IssueLabelRow,
  IssueRow,
  issueCreate,
  issueLabels,
  issueLabelsByTeam,
  issueUpdate,
  issues,
  issuesByProject,
  issuesByTeam
} from '../src/sync/issues.sync';
import * as issuesSync from '../src/sync/issues.sync';
import * as issuesServer from '../src/sync/issues.server';
import { ISSUES_DDL } from '../src/sync/issues.server';
import { ACTIVITY_DDL } from '../src/sync/activity.server';
import { INBOX_DDL } from '../src/sync/inbox.server';
import { ProjectCountsRow, projectCounts, projectCountsAll } from '../src/sync/projects.sync';
import {
  WheelMaterializer,
  type MaterializerCall,
  type MaterializerQueryStatus,
  type MaterializerQueryUpdate
} from '../../wheel/src/sync/client/materializer';

type Issue = Infer<typeof IssueRow>;
type IssueLabel = Infer<typeof IssueLabelRow>;
type ProjectCounts = Infer<typeof ProjectCountsRow>;

const TEAM_A = 'team_phase2_a';
const TEAM_B = 'team_phase2_b';
const PROJECT_A = 'project_phase2_a';
const PROJECT_B = 'project_phase2_b';
const EMPTY_PROJECT = 'project_phase2_empty';
const NOW = 1_752_800_000_000;
const live: MaterializerQueryStatus = { kind: 'live' };

function makeIssue(id: string, overrides: Partial<Issue> = {}): Issue {
  return {
    teamId: TEAM_A,
    number: 1,
    title: id,
    description: '',
    stateId: 'state_phase2_todo',
    priority: 3,
    assigneeId: null,
    creatorId: 'phase2-user',
    estimate: null,
    dueDate: null,
    parentId: null,
    projectId: PROJECT_A,
    cycleId: null,
    sortOrder: 1,
    boardOrder: 1,
    archivedAt: null,
    createdAt: NOW - 1_000,
    updatedAt: NOW - 1_000,
    ...overrides,
    id
  };
}

function makeMaterializer(): WheelMaterializer {
  return new WheelMaterializer({ actor: 'user:phase2-user', now: () => NOW });
}

function update<Params extends Record<string, unknown>, Row extends Record<string, unknown>>(
  queryDecl: QueryDecl<Params, Row>,
  params: Params,
  options: {
    readonly puts?: readonly Row[];
    readonly deletes?: readonly string[];
    readonly order?: readonly string[];
    readonly status?: MaterializerQueryStatus;
  } = {}
): MaterializerQueryUpdate {
  return {
    query: queryDecl,
    params,
    puts: options.puts,
    deletes: options.deletes,
    order: options.order ?? [],
    status: options.status ?? live
  };
}

function call<Args extends Record<string, unknown>>(
  mutation: MutationDecl<Args>,
  args: Args
): MaterializerCall<Args> {
  return { mutation, args, ids: [] };
}

function ids(rows: readonly { readonly id: string }[]): readonly string[] {
  return rows.map((row) => row.id);
}

function sortedIssues(rows: readonly Issue[]): readonly Issue[] {
  return [...rows].sort((left, right) => left.id.localeCompare(right.id));
}

describe('Tracker materializer query scopes', () => {
  test('replaces overlapping membership, preserves server order, and prunes after the final release', () => {
    const materializer = makeMaterializer();
    const shared = makeIssue('issue_phase2_shared', { sortOrder: 20 });
    const teamOnly = makeIssue('issue_phase2_team', { projectId: null, sortOrder: 10 });
    const projectOnly = makeIssue('issue_phase2_project', {
      teamId: TEAM_B,
      number: 2,
      sortOrder: 30
    });
    const publications: Array<{ team: readonly string[]; project: readonly string[] }> = [];
    materializer.onPublish(() => {
      publications.push({
        team: ids(materializer.queryRows(issuesByTeam, { teamId: TEAM_A })),
        project: ids(materializer.queryRows(issuesByProject, { projectId: PROJECT_A }))
      });
    });

    materializer.applyServerBatch({
      queries: [
        update(issuesByTeam, { teamId: TEAM_A }, {
          puts: [shared, teamOnly],
          order: [shared.id, teamOnly.id]
        }),
        update(issuesByProject, { projectId: PROJECT_A }, {
          puts: [projectOnly],
          order: [projectOnly.id, shared.id]
        }),
        update(issuesByProject, { projectId: EMPTY_PROJECT })
      ]
    });

    expect(publications).toEqual([
      {
        team: [shared.id, teamOnly.id],
        project: [projectOnly.id, shared.id]
      }
    ]);
    expect(materializer.queryStatus(issuesByProject, { projectId: EMPTY_PROJECT })).toEqual(live);
    expect(materializer.queryRows(issuesByProject, { projectId: EMPTY_PROJECT })).toEqual([]);

    materializer.applyServerBatch({
      queries: [
        update(issuesByTeam, { teamId: TEAM_A }, {
          deletes: [shared.id],
          order: [teamOnly.id]
        })
      ]
    });
    expect(ids(materializer.queryRows(issuesByTeam, { teamId: TEAM_A }))).toEqual([teamOnly.id]);
    expect(materializer.get(issues, shared.id)).toEqual(shared);
    expect(ids(materializer.queryRows(issuesByProject, { projectId: PROJECT_A }))).toEqual([
      projectOnly.id,
      shared.id
    ]);

    expect(materializer.releaseQuery(issuesByProject, { projectId: PROJECT_A })).toBe(true);
    expect(materializer.get(issues, shared.id)).toBeUndefined();
    expect(materializer.get(issues, projectOnly.id)).toBeUndefined();
    expect(materializer.get(issues, teamOnly.id)).toEqual(teamOnly);

    expect(materializer.releaseQuery(issuesByTeam, { teamId: TEAM_A })).toBe(true);
    expect(materializer.get(issues, teamOnly.id)).toBeUndefined();
    expect(materializer.queryStatus(issuesByProject, { projectId: EMPTY_PROJECT })).toEqual(live);
  });
});

describe('Tracker materializer multi-table actions', () => {
  test('publishes issue creation and every label link as one view', () => {
    const materializer = makeMaterializer();
    const existing = makeIssue('issue_phase2_existing', { sortOrder: 10 });
    materializer.applyServerBatch({
      queries: [
        update(issuesByTeam, { teamId: TEAM_A }, { puts: [existing], order: [existing.id] }),
        update(issueLabelsByTeam, { teamId: TEAM_A })
      ]
    });
    const observed: Array<{
      issues: readonly string[];
      links: readonly string[];
      changed: readonly string[];
    }> = [];
    materializer.onPublish((publication) => {
      observed.push({
        issues: ids(materializer.queryRows(issuesByTeam, { teamId: TEAM_A })),
        links: materializer
          .queryRows(issueLabelsByTeam, { teamId: TEAM_A })
          .map((link) => `${link.issueId}:${link.labelId}`),
        changed: [...publication.changedTables].sort()
      });
    });

    const issueId = 'issue_phase2_created';
    const labelIds = ['label_phase2_a', 'label_phase2_b'];
    expect(materializer.enqueue({
      mutationId: 'create_phase2',
      calls: [
        call(issueCreate, {
          issueId,
          teamId: TEAM_A,
          title: 'Created together',
          description: '',
          stateId: 'state_phase2_todo',
          priority: 2,
          assigneeId: null,
          estimate: null,
          dueDate: null,
          parentId: null,
          sortOrder: 0,
          boardOrder: 0,
          labelIds
        })
      ],
      requireUndo: false
    })).toEqual({ state: 'pending' });

    expect(observed).toEqual([
      {
        issues: [issueId, existing.id],
        links: [`${issueId}:${labelIds[0]}`, `${issueId}:${labelIds[1]}`],
        changed: ['issue_labels', 'issues']
      }
    ]);

    const confirmed = makeIssue(issueId, {
      number: 2,
      title: 'Created together',
      priority: 2,
      projectId: null,
      sortOrder: 0,
      boardOrder: 0,
      createdAt: NOW,
      updatedAt: NOW
    });
    const links: IssueLabel[] = labelIds.map((labelId) => ({ issueId, labelId, teamId: TEAM_A }));
    materializer.applyServerBatch({
      queries: [
        update(issuesByTeam, { teamId: TEAM_A }, {
          puts: [confirmed],
          order: [issueId, existing.id]
        }),
        update(issueLabelsByTeam, { teamId: TEAM_A }, {
          puts: links,
          order: links.map((link) => `${link.issueId}:${link.labelId}`)
        })
      ],
      settledCommandIds: ['create_phase2']
    });

    expect(observed).toHaveLength(2);
    expect(materializer.commandState('create_phase2')).toEqual({ state: 'confirmed' });
    expect(materializer.get(issues, issueId)).toEqual(confirmed);
    expect(materializer.rows(issueLabels)).toEqual(links);
  });

  test('publishes related issue membership and aggregate counts in one confirmed batch', () => {
    const materializer = makeMaterializer();
    const source = makeIssue('issue_phase2_aggregate');
    const sourceCounts: ProjectCounts = { projectId: PROJECT_A, total: 1, completed: 0 };
    materializer.applyServerBatch({
      queries: [
        update(issuesByTeam, { teamId: TEAM_A }, { puts: [source], order: [source.id] }),
        update(issuesByProject, { projectId: PROJECT_A }, { order: [source.id] }),
        update(issuesByProject, { projectId: PROJECT_B }),
        update(projectCountsAll, {}, { puts: [sourceCounts], order: [PROJECT_A] })
      ]
    });

    const observed: Array<{
      source: readonly string[];
      target: readonly string[];
      counts: readonly ProjectCounts[];
    }> = [];
    materializer.onPublish(() => {
      observed.push({
        source: ids(materializer.queryRows(issuesByProject, { projectId: PROJECT_A })),
        target: ids(materializer.queryRows(issuesByProject, { projectId: PROJECT_B })),
        counts: materializer.queryRows(projectCountsAll, {})
      });
    });

    expect(materializer.enqueue({
      mutationId: 'move_project_phase2',
      calls: [call(issueUpdate, { issueId: source.id, patch: { projectId: PROJECT_B } })],
      requireUndo: true
    })).toEqual({ state: 'pending' });
    expect(observed).toEqual([{ source: [], target: [source.id], counts: [sourceCounts] }]);

    const moved = { ...source, projectId: PROJECT_B, updatedAt: NOW };
    const targetCounts: ProjectCounts = { projectId: PROJECT_B, total: 1, completed: 0 };
    materializer.applyServerBatch({
      queries: [
        update(issuesByTeam, { teamId: TEAM_A }, { puts: [moved], order: [moved.id] }),
        update(issuesByProject, { projectId: PROJECT_A }, { deletes: [moved.id] }),
        update(issuesByProject, { projectId: PROJECT_B }, { order: [moved.id] }),
        update(projectCountsAll, {}, {
          puts: [targetCounts],
          deletes: [PROJECT_A],
          order: [PROJECT_B]
        })
      ],
      settledCommandIds: ['move_project_phase2']
    });

    expect(observed).toHaveLength(2);
    expect(observed[1]).toEqual({ source: [], target: [source.id], counts: [targetCounts] });
    expect(materializer.get(projectCounts, PROJECT_A)).toBeUndefined();
    expect(materializer.get(projectCounts, PROJECT_B)).toEqual(targetCounts);
  });
});

describe('Tracker grouped updates', () => {
  test('publishes, settles, and undoes three issue updates as one command each', () => {
    const materializer = makeMaterializer();
    const original = [
      makeIssue('issue_phase2_group_a', { title: 'A', sortOrder: 1 }),
      makeIssue('issue_phase2_group_b', { title: 'B', sortOrder: 2 }),
      makeIssue('issue_phase2_group_c', { title: 'C', sortOrder: 3 })
    ];
    materializer.applyServerBatch({
      queries: [
        update(issuesByTeam, { teamId: TEAM_A }, { puts: original, order: ids(original) })
      ]
    });
    let publications = 0;
    materializer.onPublish(() => {
      publications += 1;
    });
    const updates = original.map((row, index) =>
      call(issueUpdate, { issueId: row.id, patch: { title: `Updated ${index + 1}` } })
    );

    expect(materializer.enqueue({
      mutationId: 'group_phase2',
      calls: updates,
      requireUndo: true
    })).toEqual({ state: 'pending' });
    expect(publications).toBe(1);
    expect(materializer.queryRows(issuesByTeam, { teamId: TEAM_A }).map((row) => row.title)).toEqual([
      'Updated 1',
      'Updated 2',
      'Updated 3'
    ]);
    const inverses = materializer.commandInverses('group_phase2');
    expect(inverses.map((inverse) => inverse.args)).toEqual([
      { issueId: original[2]!.id, patch: { title: 'C' } },
      { issueId: original[1]!.id, patch: { title: 'B' } },
      { issueId: original[0]!.id, patch: { title: 'A' } }
    ]);

    const confirmed = original.map((row, index) => ({
      ...row,
      title: `Updated ${index + 1}`,
      updatedAt: NOW
    }));
    materializer.applyServerBatch({
      queries: [
        update(issuesByTeam, { teamId: TEAM_A }, { puts: confirmed, order: ids(confirmed) })
      ],
      settledCommandIds: ['group_phase2']
    });
    expect(publications).toBe(2);
    expect(materializer.commandState('group_phase2')).toEqual({ state: 'confirmed' });
    expect(materializer.pendingCommandIds()).toEqual([]);

    expect(materializer.enqueue({
      mutationId: 'undo_phase2',
      calls: inverses.map((inverse) => ({
        mutation: inverse.mutation,
        args: inverse.args,
        ids: []
      })),
      requireUndo: true
    })).toEqual({ state: 'pending' });
    expect(publications).toBe(3);
    expect(materializer.queryRows(issuesByTeam, { teamId: TEAM_A }).map((row) => row.title)).toEqual([
      'A',
      'B',
      'C'
    ]);
    expect(materializer.pendingCommandIds()).toEqual(['undo_phase2']);

    const undone = original.map((row) => ({ ...row, updatedAt: NOW }));
    materializer.applyServerBatch({
      queries: [
        update(issuesByTeam, { teamId: TEAM_A }, { puts: undone, order: ids(undone) })
      ],
      settledCommandIds: ['undo_phase2']
    });
    expect(publications).toBe(4);
    expect(materializer.commandState('undo_phase2')).toEqual({ state: 'confirmed' });
    expect(materializer.pendingCommandIds()).toEqual([]);
  });

  test('the real client sends and undoes three Tracker updates as one command', async () => {
    const original = [
      makeIssue('issue_phase2_client_a', { title: 'A', sortOrder: 1 }),
      makeIssue('issue_phase2_client_b', { title: 'B', sortOrder: 2 }),
      makeIssue('issue_phase2_client_c', { title: 'C', sortOrder: 3 })
    ];
    const world = await World.create({
      syncModules: [issuesSync],
      servers: [issuesServer],
      setup: async (db) => {
        for (const statement of [...ISSUES_DDL, ...ACTIVITY_DDL, ...INBOX_DDL]) {
          await db.query(statement);
        }
        for (const row of original) {
          await db.query(
            `insert into issues
              (id, team_id, number, title, description, state_id, priority, assignee_id,
               creator_id, estimate, due_date, parent_id, project_id, cycle_id, sort_order,
               board_order, archived_at, created_at, updated_at)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              row.id,
              row.teamId,
              row.number,
              row.title,
              row.description,
              row.stateId,
              row.priority,
              row.assigneeId,
              row.creatorId,
              row.estimate,
              row.dueDate,
              row.parentId,
              row.projectId,
              row.cycleId,
              row.sortOrder,
              row.boardOrder,
              row.archivedAt,
              row.createdAt,
              row.updatedAt
            ]
          );
        }
      }
    });
    try {
      const client = await world.client('phase2_group_client');
      const view = await client.subscribe(issuesByTeam, { teamId: TEAM_A });
      await world.settle();
      let publications = 0;
      client.onChange(() => {
        publications += 1;
      });

      const group = client.mutateGroup(
        original.map((row, index) => ({
          mutation: issueUpdate,
          args: { issueId: row.id, patch: { title: `Client ${index + 1}` } }
        }))
      );
      expect(publications).toBe(1);
      expect(client.pendingMutations()).toBe(1);
      expect(view.rows().map((row) => row.title)).toEqual(['Client 1', 'Client 2', 'Client 3']);
      expect((await group.settled).state).toBe('confirmed');
      await world.settle();
      expect(client.mutationState(issueUpdate).all).toHaveLength(1);

      publications = 0;
      const undo = client.undo();
      expect(undo).not.toBeNull();
      expect(publications).toBe(1);
      expect(client.pendingMutations()).toBe(1);
      expect(view.rows().map((row) => row.title)).toEqual(['A', 'B', 'C']);
      expect((await undo!.settled).state).toBe('confirmed');
      await world.settle();
      expect(client.mutationState(issueUpdate).all).toHaveLength(2);
      expect(view.rows().map((row) => row.title)).toEqual(['A', 'B', 'C']);
    } finally {
      await world.close();
    }
  });
});

describe('Tracker current-client differential', () => {
  test('matches pooled rows, query order, optimistic replay, rollback, and query status', async () => {
    const shared = makeIssue('issue_phase2_diff_shared', { sortOrder: 1 });
    const teamOnly = makeIssue('issue_phase2_diff_team', { projectId: null, sortOrder: 2 });
    const projectOnly = makeIssue('issue_phase2_diff_project', {
      teamId: TEAM_B,
      number: 2,
      sortOrder: 3
    });
    let onEvent: (event: ServerEvent) => void = () => {};
    let resolveMutation: (result: MutateResult) => void = () => {};
    const mutationResult = new Promise<MutateResult>((resolve) => {
      resolveMutation = resolve;
    });
    const transport: SyncTransport = {
      async connect(_clientId, listener) {
        onEvent = listener;
      },
      async subscribe(_clientId, queryName) {
        if (queryName === issuesByTeam.name) {
          return {
            subscriptionId: 'sub_phase2_team',
            query: queryName,
            seq: 1,
            rows: [shared, teamOnly],
            status: { kind: 'live' }
          };
        }
        return {
          subscriptionId: 'sub_phase2_project',
          query: queryName,
          seq: 1,
          rows: [shared, projectOnly],
          status: { kind: 'live' }
        };
      },
      async unsubscribe() {},
      async mutateGroup() {
        return mutationResult;
      },
      async setPresence() {},
      close() {}
    };
    const client = new SyncClient({
      transport,
      clientId: 'phase2_differential',
      actor: 'user:phase2-user',
      clock: fixedClock(NOW, 0),
      randomBytes: seededRandomBytes(22),
      localCache: new MemoryCache()
    });
    const teamView = await client.subscribe(issuesByTeam, { teamId: TEAM_A });
    const projectView = await client.subscribe(issuesByProject, { projectId: PROJECT_A });
    const materializer = makeMaterializer();
    materializer.applyServerBatch({
      queries: [
        update(issuesByTeam, { teamId: TEAM_A }, {
          puts: [shared, teamOnly],
          order: [shared.id, teamOnly.id]
        }),
        update(issuesByProject, { projectId: PROJECT_A }, {
          puts: [projectOnly],
          order: [shared.id, projectOnly.id]
        })
      ]
    });

    const expectParity = () => {
      expect(sortedIssues(client.rows(issues))).toEqual(sortedIssues(materializer.rows(issues)));
      expect(teamView.rows()).toEqual(materializer.queryRows(issuesByTeam, { teamId: TEAM_A }));
      expect(projectView.rows()).toEqual(
        materializer.queryRows(issuesByProject, { projectId: PROJECT_A })
      );
      expect(teamView.status()).toEqual(materializer.queryStatus(issuesByTeam, { teamId: TEAM_A }));
      expect(projectView.status()).toEqual(
        materializer.queryStatus(issuesByProject, { projectId: PROJECT_A })
      );
    };
    expectParity();

    const handle = client.mutate(issueUpdate, {
      issueId: shared.id,
      patch: { title: 'Local title' }
    });
    materializer.enqueue({
      mutationId: 'diff_phase2',
      calls: [call(issueUpdate, { issueId: shared.id, patch: { title: 'Local title' } })],
      requireUndo: false
    });
    expectParity();

    const peer = { ...shared, title: 'Peer title', priority: 1, updatedAt: NOW + 1 };
    onEvent({
      type: 'delta',
      delta: {
        subscriptionId: 'sub_phase2_team',
        query: issuesByTeam.name,
        seq: 2,
        puts: [peer],
        deletes: [],
        order: [peer.id, teamOnly.id]
      }
    });
    onEvent({
      type: 'delta',
      delta: {
        subscriptionId: 'sub_phase2_project',
        query: issuesByProject.name,
        seq: 2,
        puts: [peer],
        deletes: [],
        order: [peer.id, projectOnly.id]
      }
    });
    materializer.applyServerBatch({
      queries: [
        update(issuesByTeam, { teamId: TEAM_A }, {
          puts: [peer],
          order: [peer.id, teamOnly.id]
        }),
        update(issuesByProject, { projectId: PROJECT_A }, {
          puts: [peer],
          order: [peer.id, projectOnly.id]
        })
      ]
    });
    expectParity();
    expect(client.get(issues, shared.id)).toMatchObject({ title: 'Local title', priority: 1 });

    onEvent({
      type: 'query_status',
      status: {
        subscriptionId: 'sub_phase2_team',
        query: issuesByTeam.name,
        seq: 2,
        status: { kind: 'stale' }
      }
    });
    onEvent({
      type: 'query_status',
      status: {
        subscriptionId: 'sub_phase2_project',
        query: issuesByProject.name,
        seq: 2,
        status: { kind: 'stale' }
      }
    });
    materializer.applyServerBatch({
      queries: [
        update(issuesByTeam, { teamId: TEAM_A }, {
          order: [peer.id, teamOnly.id],
          status: { kind: 'stale' }
        }),
        update(issuesByProject, { projectId: PROJECT_A }, {
          order: [peer.id, projectOnly.id],
          status: { kind: 'stale' }
        })
      ]
    });
    expectParity();

    await drainMicrotasks();
    resolveMutation({
      ok: false,
      rejection: { kind: 'rejection', code: 'conflict', message: 'peer won' }
    });
    expect((await handle.settled).state).toBe('rejected');
    materializer.removeCommand('diff_phase2', 'rejected');
    expectParity();
    expect(client.get(issues, shared.id)).toEqual(peer);

    teamView.release();
    projectView.release();
    client.close();
  });
});

async function drainMicrotasks(rounds = 10): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}
