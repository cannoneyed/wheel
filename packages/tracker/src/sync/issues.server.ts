/**
 * Server bindings for the issues module. Handlers mirror the optimistic
 * handlers in issues.sync.ts — with two things only the server does:
 * assigning the per-team issue `number` (race-free under the single-writer
 * loop) and enforcing the archived guards as typed rejections.
 */
import { rejection, sql } from 'wheel/sync';
import { serveMutation, serveQuery, type ServerTx, type ServerMutationCtx } from 'wheel/sync/server/cloudflare';
import {
  issueAddLabel,
  issueArchive,
  issueBulkUpdate,
  issueCreate,
  issueDelete,
  issueMove,
  issueRemoveLabel,
  issueReorder,
  issueSetParent,
  issuesByProject,
  issueUnarchive,
  issueUpdate,
  issuesByTeam,
  issueLabelsByTeam,
  labelsForTeam,
  relationAdd,
  relationRemove,
  relationsByTeam,
  actorUserId,
  type IssuePatchArgs
} from './issues.sync';
import { logActivity } from './activity.server';
import { notify } from './inbox.server';

/** DDL for the issues tables (seed lives in seed/seed.ts, shared with Worlds). */
export const ISSUES_DDL = [
  `create table if not exists issues (
     id text primary key,
     team_id text not null,
     number integer not null default 0,
     title text not null,
     description text not null default '',
     state_id text not null,
     priority integer not null default 0,
     assignee_id text,
     creator_id text not null,
     estimate integer,
     due_date text,
     parent_id text,
     project_id text,
     cycle_id text,
     sort_order real not null default 0,
     board_order real not null default 0,
     archived_at bigint,
     created_at bigint not null,
     updated_at bigint not null)`,
  // The parent_id, project_id, and cycle_id columns are in the create table.
  // SQLite has no `alter table add column if not exists`.
  `create index if not exists issues_team_idx on issues (team_id)`,
  `create index if not exists issues_team_state_idx on issues (team_id, state_id)`,
  `create table if not exists issue_relations (
     id text primary key,
     team_id text not null,
     issue_id text not null,
     related_id text not null,
     kind text not null)`,
  `create index if not exists issue_relations_team_idx on issue_relations (team_id)`,
  `create table if not exists labels (
     id text primary key,
     team_id text,
     name text not null,
     color text not null)`,
  `create table if not exists issue_labels (
     issue_id text not null,
     label_id text not null,
     team_id text not null,
     primary key (issue_id, label_id))`,
  `create index if not exists issue_labels_team_idx on issue_labels (team_id)`
];

/** issues.byTeam — every row of the team, archived included. */
export const issuesByTeamServer = serveQuery({
  query: issuesByTeam,
  sql: (params) =>
    sql`select id, team_id as "teamId", number, title, description,
               state_id as "stateId", priority, assignee_id as "assigneeId",
               creator_id as "creatorId", estimate, due_date as "dueDate",
               parent_id as "parentId", project_id as "projectId", cycle_id as "cycleId",
               sort_order as "sortOrder", board_order as "boardOrder",
               archived_at as "archivedAt", created_at as "createdAt", updated_at as "updatedAt"
        from issues
        where team_id = ${params.teamId}
        order by sort_order, id`,
  rerunOn: ['issues']
});

/** issues.byProject — a project's issues across teams. */
export const issuesByProjectServer = serveQuery({
  query: issuesByProject,
  sql: (params) =>
    sql`select id, team_id as "teamId", number, title, description,
               state_id as "stateId", priority, assignee_id as "assigneeId",
               creator_id as "creatorId", estimate, due_date as "dueDate",
               parent_id as "parentId", project_id as "projectId", cycle_id as "cycleId",
               sort_order as "sortOrder", board_order as "boardOrder",
               archived_at as "archivedAt", created_at as "createdAt", updated_at as "updatedAt"
        from issues
        where project_id = ${params.projectId}
        order by sort_order, id`,
  rerunOn: ['issues']
});

/** issue_relations.byTeam — both directions live in one per-team subscription. */
export const relationsByTeamServer = serveQuery({
  query: relationsByTeam,
  sql: (params) =>
    sql`select id, team_id as "teamId", issue_id as "issueId", related_id as "relatedId", kind
        from issue_relations where team_id = ${params.teamId}
        order by id`,
  rerunOn: ['issue_relations']
});

/** labels.forTeam — team labels plus workspace-level (team_id null) labels. */
export const labelsForTeamServer = serveQuery({
  query: labelsForTeam,
  sql: (params) =>
    sql`select id, team_id as "teamId", name, color from labels
        where team_id = ${params.teamId} or team_id is null
        order by name, id`,
  rerunOn: ['labels']
});

/** issue_labels.byTeam — the join rows, denormalized by team. */
export const issueLabelsByTeamServer = serveQuery({
  query: issueLabelsByTeam,
  sql: (params) =>
    sql`select issue_id as "issueId", label_id as "labelId", team_id as "teamId"
        from issue_labels where team_id = ${params.teamId}
        order by issue_id, label_id`,
  rerunOn: ['issue_labels']
});

/** Reject with a typed code unless the issue exists and is not archived. */
async function requireActive(tx: ServerTx, issueId: string): Promise<void> {
  const [row] = await tx.sql<{ archivedAt: number | null }>`
    select archived_at as "archivedAt" from issues where id = ${issueId}`;
  if (!row) {
    throw rejection('missing', 'This issue no longer exists.');
  }
  if (row.archivedAt !== null) {
    throw rejection('archived', 'This issue is archived — unarchive it first.');
  }
}

/** Apply an IssuePatch with one update per present field (mirrors cache.update). */
async function applyPatch(tx: ServerTx, issueId: string, patch: IssuePatchArgs, now: number): Promise<void> {
  if (patch.title !== undefined) await tx.sql`update issues set title = ${patch.title} where id = ${issueId}`;
  if (patch.description !== undefined)
    await tx.sql`update issues set description = ${patch.description} where id = ${issueId}`;
  if (patch.stateId !== undefined) await tx.sql`update issues set state_id = ${patch.stateId} where id = ${issueId}`;
  if (patch.priority !== undefined) await tx.sql`update issues set priority = ${patch.priority} where id = ${issueId}`;
  if (patch.assigneeId !== undefined)
    await tx.sql`update issues set assignee_id = ${patch.assigneeId} where id = ${issueId}`;
  if (patch.estimate !== undefined) await tx.sql`update issues set estimate = ${patch.estimate} where id = ${issueId}`;
  if (patch.dueDate !== undefined) await tx.sql`update issues set due_date = ${patch.dueDate} where id = ${issueId}`;
  if (patch.projectId !== undefined)
    await tx.sql`update issues set project_id = ${patch.projectId} where id = ${issueId}`;
  if (patch.cycleId !== undefined) await tx.sql`update issues set cycle_id = ${patch.cycleId} where id = ${issueId}`;
  await tx.sql`update issues set updated_at = ${now} where id = ${issueId}`;
}

/** Feed kinds per patch field ('detail' carries the new value; the client resolves names). */
const PATCH_ACTIVITY: ReadonlyArray<[keyof IssuePatchArgs, string]> = [
  ['title', 'renamed'],
  ['description', 'description'],
  ['stateId', 'status'],
  ['priority', 'priority'],
  ['assigneeId', 'assignee'],
  ['estimate', 'estimate'],
  ['dueDate', 'due-date'],
  ['projectId', 'project'],
  ['cycleId', 'cycle']
];

/** One activity row per field the patch touched. */
async function logPatchActivity(
  tx: ServerTx,
  ctx: ServerMutationCtx,
  issueId: string,
  patch: IssuePatchArgs
): Promise<void> {
  for (const [field, kind] of PATCH_ACTIVITY) {
    if (patch[field] !== undefined) {
      await logActivity(tx, ctx, issueId, kind, String(patch[field] ?? ''));
    }
  }
}

/** Inbox fan-out for a patch: assignment → new assignee; status → creator + assignee. */
async function notifyPatch(
  tx: ServerTx,
  ctx: ServerMutationCtx,
  issueId: string,
  patch: IssuePatchArgs
): Promise<void> {
  const [issue] = await tx.sql<{ creatorId: string; assigneeId: string | null; title: string }>`
    select creator_id as "creatorId", assignee_id as "assigneeId", title
    from issues where id = ${issueId}`;
  if (!issue) return;
  if (patch.assigneeId !== undefined && patch.assigneeId !== null) {
    await notify(tx, ctx, { userId: patch.assigneeId, issueId, kind: 'assigned', detail: issue.title });
  }
  if (patch.stateId !== undefined) {
    await notify(tx, ctx, { userId: issue.creatorId, issueId, kind: 'status', detail: issue.title });
    await notify(tx, ctx, { userId: issue.assigneeId, issueId, kind: 'status', detail: issue.title });
  }
}

/** issues.create — inserts the row, assigning the per-team number the client couldn't. */
export const issueCreateServer = serveMutation({
  mutation: issueCreate,
  handler: async (tx, args, ctx) => {
    const now = ctx.now();
    const [next] = await tx.sql<{ next: number }>`
      select coalesce(max(number), 0) + 1 as next from issues where team_id = ${args.teamId}`;
    // Upsert mirrors cache.put semantics (a redo replay may see the row).
    await tx.sql`insert into issues
        (id, team_id, number, title, description, state_id, priority, assignee_id,
         creator_id, estimate, due_date, parent_id, project_id, cycle_id,
         sort_order, board_order, archived_at, created_at, updated_at)
      values
        (${args.issueId}, ${args.teamId}, ${next?.next ?? 1}, ${args.title}, ${args.description},
         ${args.stateId}, ${args.priority}, ${args.assigneeId}, ${actorUserId(ctx.actor)},
         ${args.estimate}, ${args.dueDate}, ${args.parentId}, null, null,
         ${args.sortOrder}, ${args.boardOrder}, null, ${now}, ${now})
      on conflict (id) do update set
        title = excluded.title, description = excluded.description,
        state_id = excluded.state_id, priority = excluded.priority,
        assignee_id = excluded.assignee_id, updated_at = excluded.updated_at`;
    for (const labelId of args.labelIds) {
      await tx.sql`insert into issue_labels (issue_id, label_id, team_id)
                   values (${args.issueId}, ${labelId}, ${args.teamId})
                   on conflict (issue_id, label_id) do nothing`;
    }
    await logActivity(tx, ctx, args.issueId, 'created', '');
  }
});

/** issues.update — archived guard, then the patch. */
export const issueUpdateServer = serveMutation({
  mutation: issueUpdate,
  handler: async (tx, args, ctx) => {
    await requireActive(tx, args.issueId);
    await applyPatch(tx, args.issueId, args.patch, ctx.now());
    await logPatchActivity(tx, ctx, args.issueId, args.patch);
    await notifyPatch(tx, ctx, args.issueId, args.patch);
  }
});

/** issues.move — archived guard, then state + both orderings in one write. */
export const issueMoveServer = serveMutation({
  mutation: issueMove,
  handler: async (tx, args, ctx) => {
    await requireActive(tx, args.issueId);
    const [prior] = await tx.sql<{ stateId: string }>`
      select state_id as "stateId" from issues where id = ${args.issueId}`;
    await tx.sql`update issues
                 set state_id = ${args.stateId}, sort_order = ${args.sortOrder},
                     board_order = ${args.boardOrder}, updated_at = ${ctx.now()}
                 where id = ${args.issueId}`;
    if (prior && prior.stateId !== args.stateId) {
      await logActivity(tx, ctx, args.issueId, 'status', args.stateId);
      await notifyPatch(tx, ctx, args.issueId, { stateId: args.stateId });
    }
  }
});

/** issues.reorder — archived guard, then whichever ordering the args carry. */
export const issueReorderServer = serveMutation({
  mutation: issueReorder,
  handler: async (tx, args) => {
    await requireActive(tx, args.issueId);
    if (args.sortOrder !== undefined)
      await tx.sql`update issues set sort_order = ${args.sortOrder} where id = ${args.issueId}`;
    if (args.boardOrder !== undefined)
      await tx.sql`update issues set board_order = ${args.boardOrder} where id = ${args.issueId}`;
  }
});

/** issues.archive — idempotent (already-archived targets stay archived). */
export const issueArchiveServer = serveMutation({
  mutation: issueArchive,
  handler: async (tx, args, ctx) => {
    const now = ctx.now();
    for (const issueId of args.issueIds) {
      const changed = await tx.sql<{ id: string }>`
        update issues set archived_at = ${now}, updated_at = ${now}
        where id = ${issueId} and archived_at is null returning id`;
      if (changed.length > 0) await logActivity(tx, ctx, issueId, 'archived', '');
    }
  }
});

/** issues.unarchive — idempotent restore. */
export const issueUnarchiveServer = serveMutation({
  mutation: issueUnarchive,
  handler: async (tx, args, ctx) => {
    const now = ctx.now();
    for (const issueId of args.issueIds) {
      const changed = await tx.sql<{ id: string }>`
        update issues set archived_at = null, updated_at = ${now}
        where id = ${issueId} and archived_at is not null returning id`;
      if (changed.length > 0) await logActivity(tx, ctx, issueId, 'unarchived', '');
    }
  }
});

/** issues.delete — hard delete, permitted ONLY for archived issues. */
export const issueDeleteServer = serveMutation({
  mutation: issueDelete,
  handler: async (tx, args) => {
    for (const issueId of args.issueIds) {
      const [row] = await tx.sql<{ archivedAt: number | null }>`
        select archived_at as "archivedAt" from issues where id = ${issueId}`;
      if (row && row.archivedAt === null) {
        throw rejection('not-archived', 'Only archived issues can be permanently deleted.');
      }
      await tx.sql`delete from issue_labels where issue_id = ${issueId}`;
      await tx.sql`delete from issues where id = ${issueId}`;
    }
  }
});

/** issues.bulkUpdate — atomic: any archived target rejects the whole batch. */
export const issueBulkUpdateServer = serveMutation({
  mutation: issueBulkUpdate,
  handler: async (tx, args, ctx) => {
    const now = ctx.now();
    for (const update of args.updates) {
      await requireActive(tx, update.issueId);
    }
    for (const update of args.updates) {
      await applyPatch(tx, update.issueId, update.patch, now);
      await logPatchActivity(tx, ctx, update.issueId, update.patch);
      await notifyPatch(tx, ctx, update.issueId, update.patch);
    }
  }
});

/** issues.setParent — same-team + acyclic guards, then one write + activity. */
export const issueSetParentServer = serveMutation({
  mutation: issueSetParent,
  handler: async (tx, args, ctx) => {
    await requireActive(tx, args.issueId);
    if (args.parentId !== null) {
      if (args.parentId === args.issueId) {
        throw rejection('cycle', 'An issue cannot be its own parent.');
      }
      const [child] = await tx.sql<{ teamId: string }>`
        select team_id as "teamId" from issues where id = ${args.issueId}`;
      const [parent] = await tx.sql<{ teamId: string }>`
        select team_id as "teamId" from issues where id = ${args.parentId}`;
      if (!parent) throw rejection('missing', 'The parent issue no longer exists.');
      if (child && parent.teamId !== child.teamId) {
        throw rejection('team', 'Sub-issues must belong to the same team as their parent.');
      }
      // Walk the ancestor chain; hitting the child means the edge would close a loop.
      let cursor: string | null = args.parentId;
      while (cursor !== null) {
        const rows: Array<{ parentId: string | null }> = await tx.sql`
          select parent_id as "parentId" from issues where id = ${cursor}`;
        cursor = rows[0]?.parentId ?? null;
        if (cursor === args.issueId) {
          throw rejection('cycle', 'That parent is already a sub-issue of this issue.');
        }
      }
    }
    await tx.sql`update issues set parent_id = ${args.parentId}, updated_at = ${ctx.now()}
                 where id = ${args.issueId}`;
    await logActivity(tx, ctx, args.issueId, 'parented', args.parentId ?? '');
  }
});

/** issue_relations.add — idempotent upsert + activity on both issues. */
export const relationAddServer = serveMutation({
  mutation: relationAdd,
  handler: async (tx, args, ctx) => {
    await requireActive(tx, args.issueId);
    await tx.sql`insert into issue_relations (id, team_id, issue_id, related_id, kind)
                 values (${args.relationId}, ${args.teamId}, ${args.issueId}, ${args.relatedId}, ${args.kind})
                 on conflict (id) do nothing`;
    await logActivity(tx, ctx, args.issueId, 'related', `${args.kind}:${args.relatedId}`);
  }
});

/** issue_relations.remove — idempotent delete + activity. */
export const relationRemoveServer = serveMutation({
  mutation: relationRemove,
  handler: async (tx, args, ctx) => {
    const [row] = await tx.sql<{ issueId: string; kind: string; relatedId: string }>`
      select issue_id as "issueId", kind, related_id as "relatedId"
      from issue_relations where id = ${args.relationId}`;
    await tx.sql`delete from issue_relations where id = ${args.relationId}`;
    if (row) {
      await logActivity(tx, ctx, row.issueId, 'unrelated', `${row.kind}:${row.relatedId}`);
    }
  }
});

/** issues.addLabel — archived guard, idempotent insert. */
export const issueAddLabelServer = serveMutation({
  mutation: issueAddLabel,
  handler: async (tx, args) => {
    await requireActive(tx, args.issueId);
    await tx.sql`insert into issue_labels (issue_id, label_id, team_id)
                 values (${args.issueId}, ${args.labelId}, ${args.teamId})
                 on conflict (issue_id, label_id) do nothing`;
  }
});

/** issues.removeLabel — archived guard, idempotent delete. */
export const issueRemoveLabelServer = serveMutation({
  mutation: issueRemoveLabel,
  handler: async (tx, args) => {
    await requireActive(tx, args.issueId);
    await tx.sql`delete from issue_labels
                 where issue_id = ${args.issueId} and label_id = ${args.labelId}`;
  }
});
