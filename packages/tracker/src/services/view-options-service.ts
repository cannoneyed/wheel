/**
 * Per-view filters + display options and the derived visible
 * row sets. Plain (non-live) service: in split view each pane isolates
 * its own instance via `inheritServices: 'live'`.
 *
 * Filter semantics: OR within a field, AND across fields. The assignee
 * filter's 'none' sentinel matches unassigned issues.
 */
import { Service } from 'wheel/core';
import { type QueryStatus } from 'wheel/sync';
import { priorityRank } from '../utils/priorities';
import { IssueService, type Issue, type Label } from './issue-service';
import { ProjectService } from './project-service';
import { CycleService } from './cycle-service';
import { TeamService, type User, type WorkflowState } from './team-service';

/** How the list orders rows within a state group. */
export type IssueOrdering = 'manual' | 'priority' | 'updated' | 'created';

/** The assignee-filter sentinel for "unassigned". */
export const UNASSIGNED = 'none';

/** One list group: a workflow state and its visible rows. */
export interface IssueGroup {
  readonly state: WorkflowState;
  readonly rows: readonly Issue[];
}

/** Display-ready row data — rows/cards render this without their own lookups. */
export interface IssueVm {
  readonly issue: Issue;
  /** The team's identifier prefix (`ENG` in ENG-42). */
  readonly teamKey: string;
  /** The workflow state's color (drives the status dot). */
  readonly stateColor: string;
  readonly assignee: User | undefined;
  readonly labels: readonly Label[];
  /** Project name, when assigned (detail chips + rows). */
  readonly projectName: string | undefined;
  /** Cycle display label, when scheduled. */
  readonly cycleLabel: string | undefined;
}

/** One list group with display-ready rows. */
export interface IssueGroupVm {
  readonly state: WorkflowState;
  readonly rows: readonly IssueVm[];
}

/** One board column with display-ready cards. */
export interface BoardColumnVm {
  readonly state: WorkflowState;
  readonly cards: readonly IssueVm[];
}

/** Owns filters + display options and derives every visible row set. */
export class ViewOptionsService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'ViewOptionsService';

  private readonly issueService = this.service(IssueService);
  private readonly teamService = this.service(TeamService);
  private readonly projectService = this.service(ProjectService);
  private readonly cycleService = this.service(CycleService);

  // Filter/display state as public atoms — components connect directly
  // (`view({ priorities: svc.priorities })`); no mirror computeds. Reads
  // elsewhere go through `.get()`.
  /** Active priority filter values. */
  readonly priorities = this.atom<ReadonlySet<number>>(new Set(), 'priorities');
  /** Active assignee filter ids (may include UNASSIGNED). */
  readonly assignees = this.atom<ReadonlySet<string>>(new Set(), 'assignees');
  /** Active label filter ids. */
  readonly labels = this.atom<ReadonlySet<string>>(new Set(), 'labels');
  /** Active state filter ids. */
  readonly states = this.atom<ReadonlySet<string>>(new Set(), 'states');
  /** Active project filter ids (may include UNASSIGNED for "no project"). */
  readonly projectsFilter = this.atom<ReadonlySet<string>>(new Set(), 'projectsFilter');
  /** Active cycle filter ids (may include UNASSIGNED for "no cycle"). */
  readonly cyclesFilter = this.atom<ReadonlySet<string>>(new Set(), 'cyclesFilter');
  /** The list ordering within groups. */
  readonly ordering = this.atom<IssueOrdering>('manual', 'ordering');
  /** Whether empty groups render. */
  readonly showEmptyGroups = this.atom<boolean>(false, 'showEmptyGroups');
  /** Whether archived rows are shown (dimmed) in the list. */
  readonly showArchived = this.atom<boolean>(false, 'showArchived');
  /** Whether any filter is active. */
  readonly hasFilters = this.computed(
    () =>
      this.priorities.get().size > 0 ||
      this.assignees.get().size > 0 ||
      this.labels.get().size > 0 ||
      this.states.get().size > 0 ||
      this.projectsFilter.get().size > 0 ||
      this.cyclesFilter.get().size > 0,
    'hasFilters'
  );

  /** Whether one issue passes the active filters. */
  readonly matches = this.computedFor(
    (teamId: string, issueId: string): boolean => {
      const issue = this.issueService.issue(teamId, issueId);
      if (!issue) return false;
      const priorities = this.priorities.get();
      if (priorities.size > 0 && !priorities.has(issue.priority)) return false;
      const assignees = this.assignees.get();
      if (assignees.size > 0 && !assignees.has(issue.assigneeId ?? UNASSIGNED)) return false;
      const states = this.states.get();
      if (states.size > 0 && !states.has(issue.stateId)) return false;
      const projectFilter = this.projectsFilter.get();
      if (projectFilter.size > 0 && !projectFilter.has(issue.projectId ?? UNASSIGNED)) return false;
      const cycleFilter = this.cyclesFilter.get();
      if (cycleFilter.size > 0 && !cycleFilter.has(issue.cycleId ?? UNASSIGNED)) return false;
      const labelFilter = this.labels.get();
      if (labelFilter.size > 0) {
        const labelIds = this.issueService.labelIdsOf(teamId, issue.id);
        if (!labelIds.some((labelId) => labelFilter.has(labelId))) return false;
      }
      return true;
    },
    'matches'
  );

  private ordered(rows: readonly Issue[]): readonly Issue[] {
    const ordering = this.ordering.get();
    if (ordering === 'manual') return rows;
    const sorted = [...rows];
    if (ordering === 'priority') {
      sorted.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.sortOrder - b.sortOrder);
    } else if (ordering === 'updated') {
      sorted.sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));
    } else {
      sorted.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1));
    }
    return sorted;
  }

  /** Visible rows of one state group in the LIST view (filtered + ordered). */
  readonly visibleIn = this.computedFor(
    (teamId: string, stateId: string): readonly Issue[] => {
      const active = this.ordered(
        this.issueService.issuesIn(teamId, stateId).filter((issue) => this.matches(teamId, issue.id))
      );
      if (!this.showArchived.get()) return active;
      const archived = this.issueService
        .archivedFor(teamId)
        .filter((issue) => issue.stateId === stateId && this.matches(teamId, issue.id));
      return [...active, ...archived];
    },
    'visibleIn'
  );

  /** Visible rows of one BOARD column (filtered, always board-ordered). */
  readonly boardVisibleIn = this.computedFor(
    (teamId: string, stateId: string): readonly Issue[] =>
      this.issueService.boardIn(teamId, stateId).filter((issue) => this.matches(teamId, issue.id)),
    'boardVisibleIn'
  );

  /** The list groups in state order (empty ones dropped unless shown). */
  readonly groups = this.computedFor(
    (teamId: string): readonly IssueGroup[] =>
      this.teamService
        .states(teamId)
        .map((state) => ({ state, rows: this.visibleIn(teamId, state.id) }))
        .filter((group) => group.rows.length > 0 || this.showEmptyGroups.get()),
    'groups'
  );

  /** Flat visible id order across groups — the keyboard-navigation space. */
  readonly visibleIds = this.computedFor(
    (teamId: string): readonly string[] =>
      this.groups(teamId).flatMap((group) => group.rows.map((issue) => issue.id)),
    'visibleIds'
  );

  private vm(teamId: string, teamKey: string, issue: Issue): IssueVm {
    return {
      issue,
      teamKey,
      stateColor:
        this.teamService.states(teamId).find((state) => state.id === issue.stateId)?.color ?? 'var(--ink-muted)',
      assignee: issue.assigneeId === null ? undefined : this.teamService.user(issue.assigneeId),
      labels: this.issueService.labelsOf(teamId, issue.id),
      projectName: issue.projectId === null ? undefined : this.projectService.project(issue.projectId)?.name,
      cycleLabel: issue.cycleId === null ? undefined : this.cycleService.label(teamId, issue.cycleId)
    };
  }

  /** The list groups with display-ready rows (what IssueList renders). */
  readonly groupVms = this.computedFor(
    (teamId: string): readonly IssueGroupVm[] => {
      const teamKey = this.teamService.team(teamId)?.key ?? '';
      return this.groups(teamId).map((group) => ({
        state: group.state,
        rows: group.rows.map((issue) => this.vm(teamId, teamKey, issue))
      }));
    },
    'groupVms'
  );

  /** Every board column (all states) with display-ready cards. */
  readonly boardColumns = this.computedFor(
    (teamId: string): readonly BoardColumnVm[] => {
      const teamKey = this.teamService.team(teamId)?.key ?? '';
      return this.teamService.states(teamId).map((state) => ({
        state,
        cards: this.boardVisibleIn(teamId, state.id).map((issue) => this.vm(teamId, teamKey, issue))
      }));
    },
    'boardColumns'
  );

  /** The team's issue-subscription lifecycle (drives the page's loading state). */
  readonly loadState = this.computedFor((teamId: string): QueryStatus => this.issueService.statusFor(teamId), 'loadState');

  /** Display-ready vm for ONE issue (the detail view's read). */
  readonly issueVm = this.computedFor(
    (teamId: string, issueId: string): IssueVm | undefined => {
      const issue = this.issueService.issue(teamId, issueId);
      if (!issue) return undefined;
      return this.vm(teamId, this.teamService.team(teamId)?.key ?? '', issue);
    },
    'issueVm'
  );

  /** Toggle a priority filter value. */
  readonly togglePriority = this.action((value: number) => {
    this.priorities.update((draft) => {
      if (draft.has(value)) draft.delete(value);
      else draft.add(value);
    });
  }, 'togglePriority');

  /** Toggle an assignee filter id (UNASSIGNED for "no assignee"). */
  readonly toggleAssignee = this.action((userId: string) => {
    this.assignees.update((draft) => {
      if (draft.has(userId)) draft.delete(userId);
      else draft.add(userId);
    });
  }, 'toggleAssignee');

  /** Toggle a label filter id. */
  readonly toggleLabel = this.action((labelId: string) => {
    this.labels.update((draft) => {
      if (draft.has(labelId)) draft.delete(labelId);
      else draft.add(labelId);
    });
  }, 'toggleLabel');

  /** Toggle a state filter id. */
  readonly toggleState = this.action((stateId: string) => {
    this.states.update((draft) => {
      if (draft.has(stateId)) draft.delete(stateId);
      else draft.add(stateId);
    });
  }, 'toggleState');

  /** Toggle a project filter id (UNASSIGNED for "no project"). */
  readonly toggleProject = this.action((projectId: string) => {
    this.projectsFilter.update((draft) => {
      if (draft.has(projectId)) draft.delete(projectId);
      else draft.add(projectId);
    });
  }, 'toggleProject');

  /** Toggle a cycle filter id (UNASSIGNED for "no cycle"). */
  readonly toggleCycle = this.action((cycleId: string) => {
    this.cyclesFilter.update((draft) => {
      if (draft.has(cycleId)) draft.delete(cycleId);
      else draft.add(cycleId);
    });
  }, 'toggleCycle');

  /** Set the list ordering. */
  readonly setOrdering = this.action((ordering: IssueOrdering) => this.ordering.set(ordering), 'setOrdering');
  /** Toggle empty-group visibility. */
  readonly toggleShowEmpty = this.action(() => this.showEmptyGroups.set(!this.showEmptyGroups.get()), 'toggleShowEmpty');
  /** Toggle archived-row visibility. */
  readonly toggleShowArchived = this.action(
    () => this.showArchived.set(!this.showArchived.get()),
    'toggleShowArchived'
  );
  /** Serialize the filter + display config (the saved-view payload). */
  readonly snapshot = this.computed(
    (): { filters: string; display: string } => ({
      filters: JSON.stringify({
        priorities: [...this.priorities.get()],
        assignees: [...this.assignees.get()],
        labels: [...this.labels.get()],
        states: [...this.states.get()],
        projects: [...this.projectsFilter.get()],
        cycles: [...this.cyclesFilter.get()]
      }),
      display: JSON.stringify({
        ordering: this.ordering.get(),
        showEmpty: this.showEmptyGroups.get(),
        showArchived: this.showArchived.get()
      })
    }),
    'snapshot'
  );

  /** Apply a saved view's serialized config (unknown fields ignored). */
  readonly applySnapshot = this.action((filters: string, display: string) => {
    try {
      const parsedFilters = JSON.parse(filters) as Partial<Record<string, unknown[]>>;
      this.priorities.set(new Set((parsedFilters.priorities ?? []) as number[]));
      this.assignees.set(new Set((parsedFilters.assignees ?? []) as string[]));
      this.labels.set(new Set((parsedFilters.labels ?? []) as string[]));
      this.states.set(new Set((parsedFilters.states ?? []) as string[]));
      this.projectsFilter.set(new Set((parsedFilters.projects ?? []) as string[]));
      this.cyclesFilter.set(new Set((parsedFilters.cycles ?? []) as string[]));
      const parsedDisplay = JSON.parse(display) as Partial<{
        ordering: IssueOrdering;
        showEmpty: boolean;
        showArchived: boolean;
      }>;
      if (parsedDisplay.ordering) this.ordering.set(parsedDisplay.ordering);
      if (parsedDisplay.showEmpty !== undefined) this.showEmptyGroups.set(parsedDisplay.showEmpty);
      if (parsedDisplay.showArchived !== undefined) this.showArchived.set(parsedDisplay.showArchived);
    } catch {
      // A malformed saved view applies nothing — better than a crash loop.
    }
  }, 'applySnapshot');

  /** Clear every filter (ordering/display toggles stay). */
  readonly clearFilters = this.action(() => {
    this.priorities.set(new Set());
    this.assignees.set(new Set());
    this.labels.set(new Set());
    this.states.set(new Set());
    this.projectsFilter.set(new Set());
    this.cyclesFilter.set(new Set());
  }, 'clearFilters');
}
