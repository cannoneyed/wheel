/**
 * Issues sync module: the shared client/server contract for issues, labels,
 * and the issue↔label join. Optimistic handlers mirror issues.server.ts
 * exactly (same writes, same id discipline).
 *
 * Id discipline: a new issue's id is ARGS-BORNE (`client.newId('issue')` in
 * IssueService), because `invert` runs before the optimistic apply — a
 * creating mutation can only name its inverse ("archive that issue") if the
 * id already travels in the args.
 *
 * Server-assigned field: `number` (the ENG-42 identifier) is a per-team
 * sequence only the server can assign race-free. The optimistic row carries
 * the sentinel 0; the UI renders it as a pending "ENG-…" until the server
 * confirms and the rebase swaps the real number in.
 *
 * Undo model: every mutation except `issues.delete` declares `invert`; hard
 * delete is deliberately NOT undoable and is server-guarded to archived
 * issues only (soft-delete doctrine).
 */
import { mutation, orphan, patchMutation, query, t, table, type Infer, type InverseSpec } from 'wheel/sync';

/** One issue row as it lives in SQLite and every client cache. */
export const IssueRow = t.object({
  id: t.string(),
  teamId: t.string(),
  /** Server-assigned per-team sequence; 0 = optimistic placeholder. */
  number: t.number(),
  title: t.string(),
  description: t.string(),
  stateId: t.string(),
  /** 0 none · 1 urgent · 2 high · 3 medium · 4 low. */
  priority: t.number(),
  assigneeId: t.string().nullable(),
  creatorId: t.string(),
  estimate: t.number().nullable(),
  /** ISO date (YYYY-MM-DD) or null. */
  dueDate: t.string().nullable(),
  /** Parent issue id (sub-issues) or null. */
  parentId: t.string().nullable(),
  /** Project this issue belongs to, or null. */
  projectId: t.string().nullable(),
  /** Cycle this issue is scheduled in, or null. */
  cycleId: t.string().nullable(),
  /** Fractional sort key within the list view's state group. */
  sortOrder: t.number(),
  /** Fractional sort key within the board column (independent of the list). */
  boardOrder: t.number(),
  archivedAt: t.number().nullable(),
  createdAt: t.number(),
  updatedAt: t.number()
});

/** The issues table. */
export const issues = table({ name: 'issues', type: IssueRow, key: (row) => row.id });

/** A label; `teamId` null = workspace-level label visible to every team. */
export const LabelRow = t.object({
  id: t.string(),
  teamId: t.string().nullable(),
  name: t.string(),
  color: t.string()
});

/** The labels table. */
export const labels = table({ name: 'labels', type: LabelRow, key: (row) => row.id });

/** An issue↔issue relation. `blocks`: issueId blocks relatedId. */
export const RelationRow = t.object({
  id: t.string(),
  teamId: t.string(),
  issueId: t.string(),
  relatedId: t.string(),
  kind: t.enum(['blocks', 'relates', 'duplicate'])
});

/** The issue_relations table. */
export const issueRelations = table({
  name: 'issue_relations',
  type: RelationRow,
  key: (row) => row.id
});

/** Issue↔label join row. `teamId` is denormalized so the per-team query has a pure projection. */
export const IssueLabelRow = t.object({
  issueId: t.string(),
  labelId: t.string(),
  teamId: t.string()
});

/** The issue_labels join table (composite key). */
export const issueLabels = table({
  name: 'issue_labels',
  type: IssueLabelRow,
  key: (row) => `${row.issueId}:${row.labelId}`
});

/** Every issue of one team, archived included (clients filter archivedAt). */
export const issuesByTeam = query({
  name: 'issues.byTeam',
  params: t.object({ teamId: t.string() }),
  into: issues,
  projection: {
    filter: (row, params) => row.teamId === params.teamId,
    // Tie-break by id so both sides order deterministically on equal keys.
    sort: (a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1)
  }
});

/** A team's labels: its own plus the workspace-level ones. */
export const labelsForTeam = query({
  name: 'labels.forTeam',
  params: t.object({ teamId: t.string() }),
  into: labels,
  projection: {
    filter: (row, params) => row.teamId === params.teamId || row.teamId === null,
    sort: (a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1)
  }
});

/** The issue↔label links for one team's issues. */
export const issueLabelsByTeam = query({
  name: 'issue_labels.byTeam',
  params: t.object({ teamId: t.string() }),
  into: issueLabels,
  projection: {
    filter: (row, params) => row.teamId === params.teamId,
    sort: (a, b) => (`${a.issueId}:${a.labelId}` < `${b.issueId}:${b.labelId}` ? -1 : 1)
  }
});

/** A team's issue relations (powers list "blocked" indicators AND the detail panel). */
export const relationsByTeam = query({
  name: 'issue_relations.byTeam',
  params: t.object({ teamId: t.string() }),
  into: issueRelations,
  projection: {
    filter: (row, params) => row.teamId === params.teamId,
    sort: (a, b) => (a.id < b.id ? -1 : 1)
  }
});

/** A project's issues across teams (the project page's list). */
export const issuesByProject = query({
  name: 'issues.byProject',
  params: t.object({ projectId: t.string() }),
  into: issues,
  projection: {
    filter: (row, params) => row.projectId === params.projectId,
    sort: (a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1)
  }
});

/**
 * The editable-field patch shared by issues.update and issues.bulkUpdate.
 * Absent field = unchanged; explicit null = clear (assignee/estimate/dueDate).
 */
export const IssuePatch = t.object({
  title: t.string().optional(),
  description: t.string().optional(),
  stateId: t.string().optional(),
  priority: t.number().optional(),
  assigneeId: t.string().nullable().optional(),
  estimate: t.number().nullable().optional(),
  dueDate: t.string().nullable().optional(),
  projectId: t.string().nullable().optional(),
  cycleId: t.string().nullable().optional()
});

/** The patch type (see IssuePatch for null-vs-absent semantics). */
export type IssuePatchArgs = Infer<typeof IssuePatch>;

/** Relation type alias for services/components. */
export type Relation = Infer<typeof RelationRow>;

/** The prior values of exactly the fields a patch touches — the invert payload. */
function priorOf(issue: Infer<typeof IssueRow>, patch: IssuePatchArgs): IssuePatchArgs {
  const prior: Record<string, unknown> = {};
  for (const field of Object.keys(patch) as Array<keyof IssuePatchArgs>) {
    prior[field] = issue[field];
  }
  return prior as IssuePatchArgs;
}

/** The actor string is `user:<userId>`; rows store the bare userId. */
export function actorUserId(actor: string): string {
  return actor.replace(/^user:/, '');
}

/**
 * Create an issue. `sortOrder`/`boardOrder` are computed by the service
 * (top of the target state group) and travel in the args so both sides land
 * the row identically. Inverse: archive it (undo-create never hard-deletes).
 */
export const issueCreate = mutation({
  name: 'issues.create',
  args: t.object({
    issueId: t.string(),
    teamId: t.string(),
    title: t.string(),
    description: t.string(),
    stateId: t.string(),
    priority: t.number(),
    assigneeId: t.string().nullable(),
    estimate: t.number().nullable(),
    dueDate: t.string().nullable(),
    parentId: t.string().nullable(),
    sortOrder: t.number(),
    boardOrder: t.number(),
    labelIds: t.array(t.string())
  }),
  optimistic: (cache, args, ctx) => {
    const now = ctx.now();
    cache.put(issues, {
      id: args.issueId,
      teamId: args.teamId,
      number: 0,
      title: args.title,
      description: args.description,
      stateId: args.stateId,
      priority: args.priority,
      assigneeId: args.assigneeId,
      creatorId: actorUserId(ctx.actor),
      estimate: args.estimate,
      dueDate: args.dueDate,
      parentId: args.parentId,
      projectId: null,
      cycleId: null,
      sortOrder: args.sortOrder,
      boardOrder: args.boardOrder,
      archivedAt: null,
      createdAt: now,
      updatedAt: now
    });
    for (const labelId of args.labelIds) {
      cache.put(issueLabels, { issueId: args.issueId, labelId, teamId: args.teamId });
    }
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: issueArchive,
    args: { issueIds: [args.issueId] },
    description: 'create issue'
  })
});

/**
 * Patch an issue's editable fields. Inverse: patch the prior values back.
 *
 * The guard-orphan-if-gone, patch, capture-prior, self-inverse skeleton is
 * `patchMutation`'s whole job — throwing (not skipping) when the row is gone is
 * what makes a pending edit to a deleted issue surface as a LOUD `orphaned`
 * mutation instead of a silently dropped write. `stamp` re-derives `updatedAt`
 * on every apply (undo included); the inverse restores only the patched fields.
 */
export const issueUpdate = patchMutation({
  name: 'issues.update',
  args: t.object({ issueId: t.string(), patch: IssuePatch }),
  table: issues,
  id: (args) => args.issueId,
  stamp: (ctx) => ({ updatedAt: ctx.now() }),
  description: 'edit issue',
  orphanMessage: (id) => `issue ${id} is gone`
});

/** Move an issue to a state with explicit placement in both orderings. Inverse: move back. */
export const issueMove = mutation({
  name: 'issues.move',
  args: t.object({
    issueId: t.string(),
    stateId: t.string(),
    sortOrder: t.number(),
    boardOrder: t.number()
  }),
  optimistic: (cache, args, ctx) => {
    if (!cache.get(issues, args.issueId)) throw orphan(`issue ${args.issueId} is gone`);
    cache.update(issues, args.issueId, {
      stateId: args.stateId,
      sortOrder: args.sortOrder,
      boardOrder: args.boardOrder,
      updatedAt: ctx.now()
    });
  },
  invert: (reader, args): InverseSpec | null => {
    const issue = reader.get(issues, args.issueId);
    if (!issue) return null;
    return {
      mutation: issueMove,
      args: {
        issueId: args.issueId,
        stateId: issue.stateId,
        sortOrder: issue.sortOrder,
        boardOrder: issue.boardOrder
      },
      description: 'move issue'
    };
  }
});

/** Reorder within the current groups: either ordering, one row write. Inverse: put it back. */
export const issueReorder = mutation({
  name: 'issues.reorder',
  args: t.object({
    issueId: t.string(),
    sortOrder: t.number().optional(),
    boardOrder: t.number().optional()
  }),
  optimistic: (cache, args) => {
    if (!cache.get(issues, args.issueId)) throw orphan(`issue ${args.issueId} is gone`);
    const patch: Record<string, number> = {};
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    if (args.boardOrder !== undefined) patch.boardOrder = args.boardOrder;
    cache.update(issues, args.issueId, patch);
  },
  invert: (reader, args): InverseSpec | null => {
    const issue = reader.get(issues, args.issueId);
    if (!issue) return null;
    const prior: Record<string, number> = {};
    if (args.sortOrder !== undefined) prior.sortOrder = issue.sortOrder;
    if (args.boardOrder !== undefined) prior.boardOrder = issue.boardOrder;
    return { mutation: issueReorder, args: { issueId: args.issueId, ...prior }, description: 'reorder issue' };
  }
});

/** Archive issues (soft delete; one undo step for the whole batch). Inverse: unarchive them. */
export const issueArchive = mutation({
  name: 'issues.archive',
  args: t.object({ issueIds: t.array(t.string()) }),
  optimistic: (cache, args, ctx) => {
    const now = ctx.now();
    for (const issueId of args.issueIds) {
      if (cache.get(issues, issueId)) {
        cache.update(issues, issueId, { archivedAt: now, updatedAt: now });
      }
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const present = args.issueIds.filter((issueId) => reader.get(issues, issueId));
    if (present.length === 0) return null;
    return {
      mutation: issueUnarchive,
      args: { issueIds: present },
      description: args.issueIds.length === 1 ? 'archive issue' : `archive ${args.issueIds.length} issues`
    };
  }
});

/** Restore archived issues. Inverse: archive them again. */
export const issueUnarchive = mutation({
  name: 'issues.unarchive',
  args: t.object({ issueIds: t.array(t.string()) }),
  optimistic: (cache, args, ctx) => {
    const now = ctx.now();
    for (const issueId of args.issueIds) {
      if (cache.get(issues, issueId)) {
        cache.update(issues, issueId, { archivedAt: null, updatedAt: now });
      }
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const present = args.issueIds.filter((issueId) => reader.get(issues, issueId));
    if (present.length === 0) return null;
    return {
      mutation: issueArchive,
      args: { issueIds: present },
      description: args.issueIds.length === 1 ? 'unarchive issue' : `unarchive ${args.issueIds.length} issues`
    };
  }
});

/**
 * Permanently delete archived issues (and their label links). NOT invertible
 * by doctrine — the server rejects unless every target is archived, and the
 * UI fronts it with a confirm dialog.
 */
export const issueDelete = mutation({
  name: 'issues.delete',
  args: t.object({ issueIds: t.array(t.string()) }),
  optimistic: (cache, args) => {
    for (const issueId of args.issueIds) {
      for (const link of cache.list(issueLabels)) {
        if (link.issueId === issueId) {
          cache.delete(issueLabels, `${link.issueId}:${link.labelId}`);
        }
      }
      cache.delete(issues, issueId);
    }
  },
  invert: (): InverseSpec | null => null
});

/**
 * Apply per-issue patches in ONE mutation — the bulk-edit path. The service
 * builds a uniform patch across the selection; `invert` builds per-issue
 * prior patches, so a bulk edit is exactly one undo step — no kernel
 * change needed, the args are simply per-issue.
 */
export const issueBulkUpdate = mutation({
  name: 'issues.bulkUpdate',
  args: t.object({
    updates: t.array(t.object({ issueId: t.string(), patch: IssuePatch }))
  }),
  optimistic: (cache, args, ctx) => {
    const now = ctx.now();
    for (const update of args.updates) {
      if (!cache.get(issues, update.issueId)) throw orphan(`issue ${update.issueId} is gone`);
      cache.update(issues, update.issueId, { ...update.patch, updatedAt: now });
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const priors = args.updates.flatMap((update) => {
      const issue = reader.get(issues, update.issueId);
      return issue ? [{ issueId: update.issueId, patch: priorOf(issue, update.patch) }] : [];
    });
    if (priors.length === 0) return null;
    return {
      mutation: issueBulkUpdate,
      args: { updates: priors },
      description: `edit ${priors.length} issues`
    };
  }
});

/** Attach a label. Inverse: detach it. */
export const issueAddLabel = mutation({
  name: 'issues.addLabel',
  args: t.object({ issueId: t.string(), labelId: t.string(), teamId: t.string() }),
  optimistic: (cache, args) => {
    cache.put(issueLabels, { issueId: args.issueId, labelId: args.labelId, teamId: args.teamId });
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: issueRemoveLabel,
    args: { issueId: args.issueId, labelId: args.labelId, teamId: args.teamId },
    description: 'add label'
  })
});

/** Re-parent an issue (null clears). Server rejects cycles and cross-team parents. Inverse: prior parent. */
export const issueSetParent = mutation({
  name: 'issues.setParent',
  args: t.object({ issueId: t.string(), parentId: t.string().nullable() }),
  optimistic: (cache, args, ctx) => {
    if (!cache.get(issues, args.issueId)) throw orphan(`issue ${args.issueId} is gone`);
    cache.update(issues, args.issueId, { parentId: args.parentId, updatedAt: ctx.now() });
  },
  invert: (reader, args): InverseSpec | null => {
    const issue = reader.get(issues, args.issueId);
    if (!issue) return null;
    return {
      mutation: issueSetParent,
      args: { issueId: args.issueId, parentId: issue.parentId },
      description: 'set parent'
    };
  }
});

/** Add a relation (id args-borne so the inverse can name it). Inverse: remove it. */
export const relationAdd = mutation({
  name: 'issue_relations.add',
  args: t.object({
    relationId: t.string(),
    teamId: t.string(),
    issueId: t.string(),
    relatedId: t.string(),
    kind: t.enum(['blocks', 'relates', 'duplicate'])
  }),
  optimistic: (cache, args) => {
    cache.put(issueRelations, {
      id: args.relationId,
      teamId: args.teamId,
      issueId: args.issueId,
      relatedId: args.relatedId,
      kind: args.kind
    });
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: relationRemove,
    args: { relationId: args.relationId },
    description: 'add relation'
  })
});

/** Remove a relation. Inverse: re-add it (row captured via the reader). */
export const relationRemove = mutation({
  name: 'issue_relations.remove',
  args: t.object({ relationId: t.string() }),
  optimistic: (cache, args) => {
    cache.delete(issueRelations, args.relationId);
  },
  invert: (reader, args): InverseSpec | null => {
    const relation = reader.get(issueRelations, args.relationId);
    if (!relation) return null;
    return {
      mutation: relationAdd,
      args: {
        relationId: relation.id,
        teamId: relation.teamId,
        issueId: relation.issueId,
        relatedId: relation.relatedId,
        kind: relation.kind
      },
      description: 'remove relation'
    };
  }
});

/** Detach a label. Inverse: attach it back. */
export const issueRemoveLabel = mutation({
  name: 'issues.removeLabel',
  args: t.object({ issueId: t.string(), labelId: t.string(), teamId: t.string() }),
  optimistic: (cache, args) => {
    cache.delete(issueLabels, `${args.issueId}:${args.labelId}`);
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: issueAddLabel,
    args: { issueId: args.issueId, labelId: args.labelId, teamId: args.teamId },
    description: 'remove label'
  })
});
