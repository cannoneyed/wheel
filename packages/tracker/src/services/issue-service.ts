/**
 * The issues feature service: the ONLY place Axle touches issue/label synced
 * data. Owns the per-team subscriptions (lazy — a team's issues subscribe on
 * first read), every issue mutation, insertion-order math, undo/redo, and the
 * rejection→toast feedback path.
 *
 * The constructor is also the global undo contribution site: mod+z /
 * shift+mod+z and the palette commands, paired with addCleanup.
 */
import { type ServiceContext } from 'wheel/core';
import { SyncService, type QueryStatus, positionBetween, type Infer, type MutationHandle, type ExplainResult } from 'wheel/sync';
import { CommandPaletteService, KeyboardService, ToastService } from 'wheel/kit';
import {
  IssueRow,
  LabelRow,
  issueAddLabel,
  issueArchive,
  issueBulkUpdate,
  issueCreate,
  issueDelete,
  issueLabelsByTeam,
  issueMove,
  issueRemoveLabel,
  issueReorder,
  issueSetParent,
  issueUnarchive,
  issueUpdate,
  issues,
  issuesByTeam,
  labelsForTeam,
  relationAdd,
  relationRemove,
  relationsByTeam,
  type IssuePatchArgs,
  type Relation
} from '../sync/issues.sync';
import { TeamService } from './team-service';
import { UserService } from './user-service';

/** An issue row (client-side type). */
export type Issue = Infer<typeof IssueRow>;
/** A label row. */
export type Label = Infer<typeof LabelRow>;

/** What the composer submits to `create`. */
export interface IssueDraft {
  readonly title: string;
  readonly description: string;
  readonly stateId: string;
  readonly priority: number;
  readonly assigneeId: string | null;
  readonly estimate: number | null;
  readonly dueDate: string | null;
  /** Parent issue for inline sub-issue creation (composer passes null). */
  readonly parentId?: string | null;
  readonly labelIds: readonly string[];
}

/** Owns issue/label subscriptions, mutations, ordering math, and undo/redo. */
export class IssueService extends SyncService {
  private readonly toastService = this.service(ToastService);
  private readonly teamService = this.service(TeamService);
  private readonly userService = this.service(UserService);
  private readonly issuesView = this.liveQueryFor(issuesByTeam, (teamId: string) => ({ teamId }));
  private readonly labelsView = this.liveQueryFor(labelsForTeam, (teamId: string) => ({ teamId }));
  private readonly linksView = this.liveQueryFor(issueLabelsByTeam, (teamId: string) => ({ teamId }));
  private readonly relationsView = this.liveQueryFor(relationsByTeam, (teamId: string) => ({ teamId }));

  constructor(context: ServiceContext) {
    super(context);
    const keyboardService = this.service(KeyboardService);
    const paletteService = this.service(CommandPaletteService);
    this.addCleanup(keyboardService.register({ id: 'tracker.undo', key: 'mod+z', run: () => this.undo() }));
    this.addCleanup(keyboardService.register({ id: 'tracker.redo', key: 'shift+mod+z', run: () => this.redo() }));
    this.addCleanup(
      paletteService.registerCommand({
        id: 'issues.undo',
        title: 'Undo',
        keywords: ['revert'],
        when: () => this.canUndo(),
        run: () => this.undo()
      })
    );
    this.addCleanup(
      paletteService.registerCommand({
        id: 'issues.redo',
        title: 'Redo',
        keywords: ['repeat'],
        when: () => this.canRedo(),
        run: () => this.redo()
      })
    );
  }

  // Client-side undo counters aren't signals; `clientRead` rides the context
  // revision so they stay reactive (same pattern as SyncStatusService).
  /** Whether the local undo stack has an entry. */
  readonly canUndo = this.clientRead(() => this.client.canUndo(), 'canUndo');
  /** Whether the local redo stack has an entry. */
  readonly canRedo = this.clientRead(() => this.client.canRedo(), 'canRedo');
  /** Undo the last local mutation (replays its inverse as a synced mutation). */
  readonly undo = () => void this.client.undo();
  /** Redo the last undone mutation. */
  readonly redo = () => void this.client.redo();

  /** Every issue of a team (archived included), in list order. */
  readonly issuesFor = this.computedFor(
    (teamId: string): readonly Issue[] => this.issuesView(teamId).rows,
    'issuesFor'
  );
  /** Subscription lifecycle for a team's issues (drives loading skeletons). */
  readonly statusFor = this.computedFor((teamId: string): QueryStatus => this.issuesView(teamId).status, 'statusFor');
  /** One issue by id. */
  readonly issue = this.computedFor(
    (teamId: string, issueId: string): Issue | undefined =>
      this.issuesFor(teamId).find((row) => row.id === issueId),
    'issue'
  );
  /** A team's non-archived issues. */
  readonly activeFor = this.computedFor(
    (teamId: string): readonly Issue[] => this.issuesFor(teamId).filter((row) => row.archivedAt === null),
    'activeFor'
  );
  /** A team's archived issues, most recently archived first. */
  readonly archivedFor = this.computedFor(
    (teamId: string): readonly Issue[] =>
      this.issuesFor(teamId)
        .filter((row) => row.archivedAt !== null)
        .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
    'archivedFor'
  );
  /** Active issues in one state, list-ordered (sortOrder, tie-break id). */
  readonly issuesIn = this.computedFor(
    (teamId: string, stateId: string): readonly Issue[] =>
      this.activeFor(teamId)
        .filter((row) => row.stateId === stateId)
        .sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1)),
    'issuesIn'
  );
  /** Active issues in one board column, board-ordered (boardOrder, tie-break id). */
  readonly boardIn = this.computedFor(
    (teamId: string, stateId: string): readonly Issue[] =>
      this.activeFor(teamId)
        .filter((row) => row.stateId === stateId)
        .sort((a, b) => a.boardOrder - b.boardOrder || (a.id < b.id ? -1 : 1)),
    'boardIn'
  );
  /** A team's labels (workspace labels included), name-ordered. */
  readonly labelsFor = this.computedFor(
    (teamId: string): readonly Label[] => this.labelsView(teamId).rows,
    'labelsFor'
  );
  /** The label ids attached to an issue. */
  readonly labelIdsOf = this.computedFor(
    (teamId: string, issueId: string): readonly string[] =>
      this.linksView(teamId)
        .rows.filter((link) => link.issueId === issueId)
        .map((link) => link.labelId),
    'labelIdsOf'
  );
  /** The label rows attached to an issue, name-ordered. */
  readonly labelsOf = this.computedFor(
    (teamId: string, issueId: string): readonly Label[] => {
      const ids = this.labelIdsOf(teamId, issueId);
      return this.labelsFor(teamId).filter((label) => ids.includes(label.id));
    },
    'labelsOf'
  );
  /** Locate an issue across teams (full-page route only knows the id). Subscribes lazily per team. */
  readonly locate = this.computedFor(
    (issueId: string): Issue | undefined => {
      for (const team of this.teamService.teams()) {
        const found = this.issue(team.id, issueId);
        if (found) return found;
      }
      return undefined;
    },
    'locate'
  );
  /** An issue's direct sub-issues (active first by list order, archived at the end). */
  readonly childrenOf = this.computedFor(
    (teamId: string, parentId: string): readonly Issue[] =>
      this.issuesFor(teamId)
        .filter((row) => row.parentId === parentId)
        .sort(
          (a, b) =>
            Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
            a.sortOrder - b.sortOrder ||
            (a.id < b.id ? -1 : 1)
        ),
    'childrenOf'
  );
  /** Sub-issue progress: completed/total among active children. */
  readonly subProgress = this.computedFor(
    (teamId: string, parentId: string): { done: number; total: number } => {
      const children = this.childrenOf(teamId, parentId).filter((row) => row.archivedAt === null);
      const doneStates = new Set(
        this.teamService
          .states(teamId)
          .filter((state) => state.type === 'completed' || state.type === 'canceled')
          .map((state) => state.id)
      );
      return {
        done: children.filter((row) => doneStates.has(row.stateId)).length,
        total: children.length
      };
    },
    'subProgress'
  );
  /** Every relation touching an issue (either direction). */
  readonly relationsOf = this.computedFor(
    (teamId: string, issueId: string): readonly Relation[] =>
      this.relationsView(teamId).rows.filter(
        (relation) => relation.issueId === issueId || relation.relatedId === issueId
      ),
    'relationsOf'
  );
  /** The ids of issues BLOCKING this one (drives the list indicator). */
  readonly blockedBy = this.computedFor(
    (teamId: string, issueId: string): readonly string[] =>
      this.relationsView(teamId)
        .rows.filter((relation) => relation.kind === 'blocks' && relation.relatedId === issueId)
        .map((relation) => relation.issueId),
    'blockedBy'
  );
  /** A row's provenance receipt — value, last cause, full history. */
  readonly explainIssue = this.clientReadFor(
    (issueId: string): ExplainResult => this.client.explain(issues, issueId),
    'explainIssue'
  );

  /** The current actor's issues across every team (the My Issues tabs read this). */
  readonly myIssues = this.computedFor(
    (tab: 'assigned' | 'created'): ReadonlyArray<{ issue: Issue; teamKey: string }> => {
      const me = this.userService.actorId.get();
      return this.teamService.teams().flatMap((team) =>
        this.activeFor(team.id)
          .filter((issue) => (tab === 'assigned' ? issue.assigneeId === me : issue.creatorId === me))
          .map((issue) => ({ issue, teamKey: team.key }))
      );
    },
    'myIssues'
  );

  /** Where a new/moved issue lands by default: the TOP of the state group, both orderings. */
  readonly insertionOrders = this.computedFor(
    (teamId: string, stateId: string): { sortOrder: number; boardOrder: number } => {
      const listFirst = this.issuesIn(teamId, stateId)[0];
      const boardFirst = this.boardIn(teamId, stateId)[0];
      return {
        sortOrder: positionBetween(undefined, listFirst?.sortOrder),
        boardOrder: positionBetween(undefined, boardFirst?.boardOrder)
      };
    },
    'insertionOrders'
  );

  /** Surface a rejection/failure/orphan as a toast; the optimistic rollback is automatic. */
  private watch(handle: MutationHandle, verb: string): MutationHandle {
    void handle.settled.then((info) => {
      if (info.state === 'rejected') {
        this.toastService.flash(
          `reject:${info.mutationId}`,
          info.rejection?.message ?? `Could not ${verb}.`,
          'warn'
        );
      } else if (info.state === 'failed') {
        this.toastService.flash(
          `failed:${info.mutationId}`,
          `Could not ${verb} — something broke on the server (${info.error?.code ?? 'error'}).`,
          'warn'
        );
      } else if (info.state === 'orphaned') {
        this.toastService.flash(
          `orphan:${info.mutationId}`,
          `Could not ${verb} — the issue was deleted by someone else.`,
          'warn'
        );
      }
    });
    return handle;
  }

  /** Create an issue at the top of its state group. Returns the args-borne id. */
  readonly create = (teamId: string, draft: IssueDraft): string => {
    const issueId = this.client.newId('issue');
    const orders = this.insertionOrders(teamId, draft.stateId);
    this.watch(
      this.mutate(issueCreate, {
        issueId,
        teamId,
        title: draft.title,
        description: draft.description,
        stateId: draft.stateId,
        priority: draft.priority,
        assigneeId: draft.assigneeId,
        estimate: draft.estimate,
        dueDate: draft.dueDate,
        parentId: draft.parentId ?? null,
        sortOrder: orders.sortOrder,
        boardOrder: orders.boardOrder,
        labelIds: [...draft.labelIds]
      }),
      'create the issue'
    );
    return issueId;
  };

  /** Patch one issue. */
  readonly update = (issueId: string, patch: IssuePatchArgs) =>
    this.watch(this.mutate(issueUpdate, { issueId, patch }), 'update the issue');

  /** Patch many issues in ONE mutation (one undo step). */
  readonly bulkUpdate = (issueIds: readonly string[], patch: IssuePatchArgs) =>
    this.watch(
      this.mutate(issueBulkUpdate, { updates: issueIds.map((issueId) => ({ issueId, patch })) }),
      'update the issues'
    );

  /** Move an issue to a state with explicit placement (board drops). */
  readonly move = (issueId: string, stateId: string, orders: { sortOrder: number; boardOrder: number }) =>
    this.watch(this.mutate(issueMove, { issueId, stateId, ...orders }), 'move the issue');

  /** Move an issue to the top of a state (pickers, context menu, keyboard). */
  readonly moveToState = (teamId: string, issueId: string, stateId: string) =>
    this.move(issueId, stateId, this.insertionOrders(teamId, stateId));

  /** Reorder within the current group (either ordering). */
  readonly reorder = (issueId: string, orders: { sortOrder?: number; boardOrder?: number }) =>
    this.watch(this.mutate(issueReorder, { issueId, ...orders }), 'reorder the issue');

  /** Archive issues (one undo step for the batch). */
  readonly archive = (issueIds: readonly string[]) =>
    this.watch(this.mutate(issueArchive, { issueIds: [...issueIds] }), 'archive');

  /** Restore archived issues. */
  readonly unarchive = (issueIds: readonly string[]) =>
    this.watch(this.mutate(issueUnarchive, { issueIds: [...issueIds] }), 'unarchive');

  /** Permanently delete archived issues (server-guarded; NOT undoable). */
  readonly hardDelete = (issueIds: readonly string[]) =>
    this.watch(this.mutate(issueDelete, { issueIds: [...issueIds] }), 'delete');

  /** Re-parent an issue (null clears). Server rejects cycles/cross-team. */
  readonly setParent = (issueId: string, parentId: string | null) =>
    this.watch(this.mutate(issueSetParent, { issueId, parentId }), 'set the parent');

  /** Add a relation between two issues. */
  readonly addRelation = (teamId: string, issueId: string, relatedId: string, kind: Relation['kind']) =>
    this.watch(
      this.mutate(relationAdd, {
        relationId: this.client.newId('relation'),
        teamId,
        issueId,
        relatedId,
        kind
      }),
      'add the relation'
    );

  /** Remove a relation. */
  readonly removeRelation = (relationId: string) =>
    this.watch(this.mutate(relationRemove, { relationId }), 'remove the relation');

  /** Attach a label to an issue. */
  readonly addLabel = (teamId: string, issueId: string, labelId: string) =>
    this.watch(this.mutate(issueAddLabel, { issueId, labelId, teamId }), 'add the label');

  /** Detach a label from an issue. */
  readonly removeLabel = (teamId: string, issueId: string, labelId: string) =>
    this.watch(this.mutate(issueRemoveLabel, { issueId, labelId, teamId }), 'remove the label');
}
