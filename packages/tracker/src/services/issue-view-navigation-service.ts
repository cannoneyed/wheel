import { Service } from 'wheel/core';
import { DialogService } from 'wheel/kit';

import { SAVE_VIEW_DIALOG_ID } from './issue-interaction-contract';
import { IssueTargetService } from './issue-target-service';
import type { RouterService } from 'wheel/router';

import { trackerRouter, type TrackerRoutes } from '../routes';
import { PickerService } from './picker-service';
import { ProjectService } from './project-service';
import { TeamService } from './team-service';
import { ViewOptionsService } from './view-options-service';
import { ViewService } from './view-service';

/** Owns navigation pickers and saved-view flows. */
export class IssueViewNavigationService extends Service {
  private readonly targets = this.service(IssueTargetService);
  private readonly teams = this.service(TeamService);
  private readonly projects = this.service(ProjectService);
  private readonly picker = this.service(PickerService);
  private readonly viewOptions = this.service(ViewOptionsService);
  private readonly views = this.service(ViewService);
  private readonly dialogs = this.service(DialogService);
  private readonly router = this.service(trackerRouter.Service) as RouterService<TrackerRoutes>;

  /** Open the team navigation picker. */
  readonly openTeamNavPicker = this.action(() => {
    this.picker.open({
      title: 'Go to team',
      options: this.teams.teams().map((team) => ({
        id: team.id,
        label: team.name,
        icon: team.icon,
        color: team.color,
        hint: team.key
      })),
      multi: false,
      selected: () =>
        new Set(
          this.targets.currentTeamId() === null
            ? []
            : [this.targets.currentTeamId()!]
        ),
      onPick: (teamId) => this.router.navigate('team.issues', { params: { teamId } })
    });
  }, 'openTeamNavPicker');

  /** Open the project navigation picker. */
  readonly openProjectNavPicker = this.action(() => {
    this.picker.open({
      title: 'Go to project',
      options: this.projects.projects.rows.map((project) => ({
        id: project.id,
        label: project.name,
        icon: '▣'
      })),
      multi: false,
      selected: () => new Set<string>(),
      onPick: (projectId) => this.router.navigate('project', { params: { projectId } })
    });
  }, 'openProjectNavPicker');

  /** Open the save-view dialog when a team route is active. */
  readonly openSaveViewDialog = this.action(() => {
    if (this.targets.currentTeamId() !== null) {
      this.dialogs.open(SAVE_VIEW_DIALOG_ID);
    }
  }, 'openSaveViewDialog');

  /** Save this pane's current filters/display under a name. */
  readonly saveCurrentView = this.action((name: string) => {
    const teamId = this.targets.currentTeamId();
    const trimmed = name.trim();
    if (teamId === null || trimmed === '') return;
    const snapshot = this.viewOptions.snapshot();
    this.views.create(
      teamId,
      trimmed,
      snapshot.filters,
      snapshot.display
    );
    this.dialogs.closeDialog(SAVE_VIEW_DIALOG_ID);
  }, 'saveCurrentView');

  /** Apply a saved view to this pane and navigate to its team list. */
  readonly applyView = this.action((teamId: string, viewId: string) => {
    const saved = this.views.savedView(teamId, viewId);
    if (!saved) return;
    this.viewOptions.applySnapshot(saved.filters, saved.display);
    this.router.navigate('team.issues', { params: { teamId } });
  }, 'applyView');

  /** Delete a saved view. */
  readonly deleteView = this.action(
    (viewId: string) => this.views.remove(viewId),
    'deleteView'
  );
}
