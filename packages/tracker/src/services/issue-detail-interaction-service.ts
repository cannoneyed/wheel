import { Service } from 'wheel/core';
import { DialogService } from 'wheel/kit';

import { IssueService } from './issue-service';
import { IssueTargetService } from './issue-target-service';
import type { RouterService } from 'wheel/router';

import { trackerRouter, type TrackerRoutes } from '../routes';
import { PickerService } from './picker-service';
import { ProjectService } from './project-service';
import { TeamService } from './team-service';

/** Owns issue detail edits, relations, parents, and project deletion. */
export class IssueDetailInteractionService extends Service {
  private readonly issues = this.service(IssueService);
  private readonly targets = this.service(IssueTargetService);
  private readonly teams = this.service(TeamService);
  private readonly picker = this.service(PickerService);
  private readonly projects = this.service(ProjectService);
  private readonly dialogs = this.service(DialogService);
  private readonly router = this.service(trackerRouter.Service) as RouterService<TrackerRoutes>;

  /** Save an edited description. */
  readonly saveDescription = this.action((issueId: string, text: string) => {
    const issue = this.issues.locate(issueId);
    if (issue && issue.description !== text) {
      this.issues.update(issueId, { description: text });
    }
  }, 'saveDescription');

  /** Set or clear a due date. */
  readonly saveDueDate = this.action(
    (issueId: string, dueDate: string | null) => {
      const issue = this.issues.locate(issueId);
      if (issue && issue.dueDate !== dueDate) {
        this.issues.update(issueId, { dueDate });
      }
    },
    'saveDueDate'
  );

  /** Create a sub-issue in the first unstarted workflow state. */
  readonly createSubIssue = this.action(
    (parentId: string, title: string) => {
      const parent = this.issues.locate(parentId);
      const trimmed = title.trim();
      if (!parent || trimmed === '') return;
      const stateId =
        this.teams
          .states(parent.teamId)
          .find((state) => state.type === 'unstarted')?.id ??
        parent.stateId;
      this.issues.create(parent.teamId, {
        title: trimmed,
        description: '',
        stateId,
        priority: 0,
        assigneeId: null,
        estimate: null,
        dueDate: null,
        parentId,
        labelIds: []
      });
    },
    'createSubIssue'
  );

  private issueOptions(teamId: string, excludeIds: readonly string[]) {
    return this.issues
      .activeFor(teamId)
      .filter((issue) => !excludeIds.includes(issue.id))
      .map((issue) => ({
        id: issue.id,
        label: issue.title,
        hint: `${this.teams.team(teamId)?.key ?? ''}-${issue.number}`
      }));
  }

  /** Pick another issue and create the requested relation direction. */
  readonly openRelationPicker = this.action(
    (
      issueId: string,
      kind: 'blocks' | 'blocked-by' | 'relates' | 'duplicate'
    ) => {
      const teamId = this.targets.teamFor(issueId);
      if (teamId === null) return;
      const titles = {
        blocks: 'Blocks which issue?',
        'blocked-by': 'Blocked by which issue?',
        relates: 'Relates to which issue?',
        duplicate: 'Duplicate of which issue?'
      };
      this.picker.open({
        title: titles[kind],
        options: this.issueOptions(teamId, [issueId]),
        multi: false,
        selected: () => new Set<string>(),
        onPick: (pickedId) => {
          if (kind === 'blocked-by') {
            this.issues.addRelation(
              teamId,
              pickedId,
              issueId,
              'blocks'
            );
          } else if (kind === 'blocks') {
            this.issues.addRelation(
              teamId,
              issueId,
              pickedId,
              'blocks'
            );
          } else {
            this.issues.addRelation(teamId, issueId, pickedId, kind);
          }
        }
      });
    },
    'openRelationPicker'
  );

  /** Pick or clear an issue's parent. */
  readonly openParentPicker = this.action((issueId: string) => {
    const teamId = this.targets.teamFor(issueId);
    if (teamId === null) return;
    const current = this.issues.locate(issueId)?.parentId ?? null;
    this.picker.open({
      title: 'Set parent issue',
      options: [
        { id: 'none', label: 'No parent', icon: '○' },
        ...this.issueOptions(teamId, [issueId])
      ],
      multi: false,
      selected: () =>
        new Set(current === null ? ['none'] : [current]),
      onPick: (pickedId) =>
        this.issues.setParent(
          issueId,
          pickedId === 'none' ? null : pickedId
        )
    });
  }, 'openParentPicker');

  /** Delete a project after confirmation. Issues become unassigned. */
  readonly deleteProject = async (projectId: string): Promise<void> => {
    const project = this.projects.project(projectId);
    if (!project) return;
    const confirmed = await this.dialogs.confirm(
      `Delete “${project.name}”? Its issues stay but lose the project assignment (undo restores the project, not the assignments).`,
      { danger: true, confirmLabel: 'Delete project' }
    );
    if (!confirmed) return;
    this.projects.remove(projectId);
    this.router.navigate('home');
  };
}
