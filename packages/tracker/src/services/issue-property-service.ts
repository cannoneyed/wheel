import { Service } from 'wheel/core';

import { ESTIMATES, PRIORITIES } from '../utils/priorities';
import { CycleService } from './cycle-service';
import { IssueService } from './issue-service';
import { IssueTargetService } from './issue-target-service';
import { ProjectService } from './project-service';
import { TeamService } from './team-service';
import { ViewOptionsService, UNASSIGNED } from './view-options-service';
import { PickerService, type PickerOption } from './picker-service';
import { ContextMenuService } from 'wheel/kit';

/** The property-picker kinds exposed to issue components. */
export type PropertyPickerKind =
  | 'status'
  | 'assignee'
  | 'priority'
  | 'labels'
  | 'estimate'
  | 'project'
  | 'cycle';

/** The filter dimensions exposed by the list filter bar. */
export type FilterPickerKind =
  | 'status'
  | 'priority'
  | 'assignee'
  | 'label'
  | 'project'
  | 'cycle';

/** Owns property-edit and filter-picker composition. */
export class IssuePropertyService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'IssuePropertyService';

  private readonly issues = this.service(IssueService);
  private readonly teams = this.service(TeamService);
  private readonly projects = this.service(ProjectService);
  private readonly cycles = this.service(CycleService);
  private readonly targets = this.service(IssueTargetService);
  private readonly viewOptions = this.service(ViewOptionsService);
  private readonly picker = this.service(PickerService);
  private readonly menus = this.service(ContextMenuService);

  private openTargetPicker(
    issueId: string | undefined,
    build: (teamId: string, targets: readonly string[]) => void
  ): void {
    const targets = this.targets.targets(issueId);
    if (targets.length === 0) return;
    const teamId = this.targets.teamFor(targets[0]);
    if (teamId === null) return;
    this.menus.close();
    build(teamId, targets);
  }

  private applyPatch(
    targets: readonly string[],
    patch: Parameters<IssueService['update']>[1]
  ): void {
    if (targets.length === 1) {
      this.issues.update(targets[0], patch);
    } else {
      this.issues.bulkUpdate(targets, patch);
    }
  }

  private selectedField(
    targets: readonly string[],
    read: (issueId: string) => string | null
  ) {
    return (): ReadonlySet<string> => {
      const values = new Set<string>();
      for (const issueId of targets) {
        const value = read(issueId);
        if (value !== null) values.add(value);
      }
      return values;
    };
  }

  /** Open the status picker for current or explicit targets. */
  readonly openStatusPicker = this.action((issueId?: string) => {
    this.openTargetPicker(issueId, (teamId, targets) => {
      const options: PickerOption[] = this.teams.states(teamId).map((state) => ({
        id: state.id,
        label: state.name,
        icon: '●',
        color: state.color,
        hint: state.type
      }));
      this.picker.open({
        title:
          targets.length === 1
            ? 'Change status'
            : `Change status (${targets.length} issues)`,
        options,
        multi: false,
        selected: this.selectedField(
          targets,
          (id) => this.issues.issue(teamId, id)?.stateId ?? null
        ),
        onPick: (stateId) => {
          if (targets.length === 1) {
            this.issues.moveToState(teamId, targets[0], stateId);
          } else {
            this.applyPatch(targets, { stateId });
          }
        }
      });
    });
  }, 'openStatusPicker');

  /** Open the priority picker for current or explicit targets. */
  readonly openPriorityPicker = this.action((issueId?: string) => {
    this.openTargetPicker(issueId, (teamId, targets) => {
      this.picker.open({
        title:
          targets.length === 1
            ? 'Set priority'
            : `Set priority (${targets.length} issues)`,
        options: PRIORITIES.map((priority) => ({
          id: String(priority.value),
          label: priority.label,
          icon: priority.icon
        })),
        multi: false,
        selected: this.selectedField(targets, (id) => {
          const issue = this.issues.issue(teamId, id);
          return issue ? String(issue.priority) : null;
        }),
        onPick: (value) =>
          this.applyPatch(targets, { priority: Number(value) })
      });
    });
  }, 'openPriorityPicker');

  /** Open the assignee picker; `Unassigned` clears the field. */
  readonly openAssigneePicker = this.action((issueId?: string) => {
    this.openTargetPicker(issueId, (teamId, targets) => {
      const options: PickerOption[] = [
        { id: UNASSIGNED, label: 'Unassigned', icon: '○' },
        ...this.teams.users().map((user) => ({
          id: user.id,
          label: user.name,
          icon: user.initials,
          color: user.avatarColor
        }))
      ];
      this.picker.open({
        title:
          targets.length === 1
            ? 'Assign to'
            : `Assign (${targets.length} issues)`,
        options,
        multi: false,
        selected: this.selectedField(
          targets,
          (id) =>
            this.issues.issue(teamId, id)?.assigneeId ?? UNASSIGNED
        ),
        onPick: (userId) =>
          this.applyPatch(targets, {
            assigneeId: userId === UNASSIGNED ? null : userId
          })
      });
    });
  }, 'openAssigneePicker');

  /** Open the multi-label picker for current or explicit targets. */
  readonly openLabelPicker = this.action((issueId?: string) => {
    this.openTargetPicker(issueId, (teamId, targets) => {
      const allHave = (labelId: string) =>
        targets.every((id) =>
          this.issues.labelIdsOf(teamId, id).includes(labelId)
        );
      this.picker.open({
        title:
          targets.length === 1
            ? 'Change labels'
            : `Change labels (${targets.length} issues)`,
        options: this.issues.labelsFor(teamId).map((label) => ({
          id: label.id,
          label: label.name,
          icon: '●',
          color: label.color
        })),
        multi: true,
        selected: () =>
          new Set(
            this.issues
              .labelsFor(teamId)
              .map((label) => label.id)
              .filter(allHave)
          ),
        onPick: (labelId) => {
          if (allHave(labelId)) {
            for (const id of targets) {
              this.issues.removeLabel(teamId, id, labelId);
            }
          } else {
            for (const id of targets) {
              if (!this.issues.labelIdsOf(teamId, id).includes(labelId)) {
                this.issues.addLabel(teamId, id, labelId);
              }
            }
          }
        }
      });
    });
  }, 'openLabelPicker');

  /** Open the project picker; `No project` clears the field. */
  readonly openProjectPicker = this.action((issueId?: string) => {
    this.openTargetPicker(issueId, (teamId, targets) => {
      this.picker.open({
        title:
          targets.length === 1
            ? 'Move to project'
            : `Move to project (${targets.length} issues)`,
        options: [
          { id: 'none', label: 'No project', icon: '○' },
          ...this.projects.projects.rows.map((project) => ({
            id: project.id,
            label: project.name,
            icon: '▣'
          }))
        ],
        multi: false,
        selected: this.selectedField(
          targets,
          (id) => this.issues.issue(teamId, id)?.projectId ?? 'none'
        ),
        onPick: (projectId) =>
          this.applyPatch(targets, {
            projectId: projectId === 'none' ? null : projectId
          })
      });
    });
  }, 'openProjectPicker');

  /** Open the cycle picker; `No cycle` clears the field. */
  readonly openCyclePicker = this.action((issueId?: string) => {
    this.openTargetPicker(issueId, (teamId, targets) => {
      this.picker.open({
        title:
          targets.length === 1
            ? 'Move to cycle'
            : `Move to cycle (${targets.length} issues)`,
        options: [
          { id: 'none', label: 'No cycle', icon: '○' },
          ...this.cycles.cyclesFor(teamId).map((cycle) => ({
            id: cycle.id,
            label: this.cycles.label(teamId, cycle.id),
            icon: '◌'
          }))
        ],
        multi: false,
        selected: this.selectedField(
          targets,
          (id) => this.issues.issue(teamId, id)?.cycleId ?? 'none'
        ),
        onPick: (cycleId) =>
          this.applyPatch(targets, {
            cycleId: cycleId === 'none' ? null : cycleId
          })
      });
    });
  }, 'openCyclePicker');

  /** Open the estimate picker when the target team enables estimates. */
  readonly openEstimatePicker = this.action((issueId?: string) => {
    this.openTargetPicker(issueId, (teamId, targets) => {
      if (!this.teams.team(teamId)?.estimatesEnabled) return;
      this.picker.open({
        title: 'Set estimate',
        options: ESTIMATES.map((points) => ({
          id: String(points),
          label: points === 0 ? 'No estimate' : `${points} points`
        })),
        multi: false,
        selected: this.selectedField(targets, (id) => {
          const issue = this.issues.issue(teamId, id);
          return issue ? String(issue.estimate ?? 0) : null;
        }),
        onPick: (value) =>
          this.applyPatch(targets, {
            estimate: value === '0' ? null : Number(value)
          })
      });
    });
  }, 'openEstimatePicker');

  /** Dispatch one component-facing property-picker action. */
  readonly openPropertyPicker = this.action(
    (kind: PropertyPickerKind, issueId?: string) => {
      const open: Record<PropertyPickerKind, (id?: string) => void> = {
        status: this.openStatusPicker,
        assignee: this.openAssigneePicker,
        priority: this.openPriorityPicker,
        labels: this.openLabelPicker,
        estimate: this.openEstimatePicker,
        project: this.openProjectPicker,
        cycle: this.openCyclePicker
      };
      open[kind](issueId);
    },
    'openPropertyPicker'
  );

  /** Open a multi-select picker for one list filter dimension. */
  readonly openFilterPicker = this.action((kind: FilterPickerKind) => {
    const teamId = this.targets.currentTeamId();
    if (teamId === null) return;
    if (kind === 'project') {
      this.picker.open({
        title: 'Filter by project',
        options: [
          { id: UNASSIGNED, label: 'No project', icon: '○' },
          ...this.projects.projects.rows.map((project) => ({
            id: project.id,
            label: project.name,
            icon: '▣'
          }))
        ],
        multi: true,
        selected: () => this.viewOptions.projectsFilter.get(),
        onPick: (projectId) => this.viewOptions.toggleProject(projectId)
      });
      return;
    }
    if (kind === 'cycle') {
      this.picker.open({
        title: 'Filter by cycle',
        options: [
          { id: UNASSIGNED, label: 'No cycle', icon: '○' },
          ...this.cycles.cyclesFor(teamId).map((cycle) => ({
            id: cycle.id,
            label: this.cycles.label(teamId, cycle.id),
            icon: '◌'
          }))
        ],
        multi: true,
        selected: () => this.viewOptions.cyclesFilter.get(),
        onPick: (cycleId) => this.viewOptions.toggleCycle(cycleId)
      });
      return;
    }
    if (kind === 'status') {
      this.picker.open({
        title: 'Filter by status',
        options: this.teams.states(teamId).map((state) => ({
          id: state.id,
          label: state.name,
          icon: '●',
          color: state.color
        })),
        multi: true,
        selected: () => this.viewOptions.states.get(),
        onPick: (stateId) => this.viewOptions.toggleState(stateId)
      });
    } else if (kind === 'priority') {
      this.picker.open({
        title: 'Filter by priority',
        options: PRIORITIES.map((priority) => ({
          id: String(priority.value),
          label: priority.label,
          icon: priority.icon
        })),
        multi: true,
        selected: () =>
          new Set([...this.viewOptions.priorities.get()].map(String)),
        onPick: (value) => this.viewOptions.togglePriority(Number(value))
      });
    } else if (kind === 'assignee') {
      this.picker.open({
        title: 'Filter by assignee',
        options: [
          { id: UNASSIGNED, label: 'Unassigned', icon: '○' },
          ...this.teams.users().map((user) => ({
            id: user.id,
            label: user.name,
            icon: user.initials,
            color: user.avatarColor
          }))
        ],
        multi: true,
        selected: () => this.viewOptions.assignees.get(),
        onPick: (userId) => this.viewOptions.toggleAssignee(userId)
      });
    } else {
      this.picker.open({
        title: 'Filter by label',
        options: this.issues.labelsFor(teamId).map((label) => ({
          id: label.id,
          label: label.name,
          icon: '●',
          color: label.color
        })),
        multi: true,
        selected: () => this.viewOptions.labels.get(),
        onPick: (labelId) => this.viewOptions.toggleLabel(labelId)
      });
    }
  }, 'openFilterPicker');
}
