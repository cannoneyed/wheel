import { Service } from 'wheel/core';

import { IssueService } from './issue-service';
import type { RouterService } from 'wheel/router';

import { trackerRouter, type TrackerRoutes } from '../routes';
import { SelectionService } from './selection-service';
import { ViewOptionsService } from './view-options-service';

/** Resolves route-aware issue targets and visible ordering for interactions. */
export class IssueTargetService extends Service {
  private readonly issues = this.service(IssueService);
  private readonly router = this.service(trackerRouter.Service) as RouterService<TrackerRoutes>;
  private readonly selection = this.service(SelectionService);
  private readonly viewOptions = this.service(ViewOptionsService);

  /** The route's team id, or null off team routes. */
  readonly currentTeamId = this.computed(
    () => this.router.matchOf('team')?.params.teamId ?? null,
    'currentTeamId'
  );

  /** Resolve the team an action applies to: route team, then issue team. */
  readonly teamFor = (issueId?: string): string | null => {
    const routeTeam = this.currentTeamId();
    if (routeTeam !== null) {
      return routeTeam;
    }
    return issueId === undefined
      ? null
      : this.issues.locate(issueId)?.teamId ?? null;
  };

  /**
   * An action on a selected issue applies to the selection. An action on an
   * unselected issue applies only to that issue. Keyboard actions fall back
   * from selection to cursor.
   */
  readonly targets = (issueId?: string): readonly string[] => {
    if (issueId !== undefined) {
      return this.selection.isSelected(issueId)
        ? this.selection.ids()
        : [issueId];
    }
    if (this.selection.hasSelection()) {
      return this.selection.ids();
    }
    const cursor = this.selection.cursor.get();
    return cursor === null ? [] : [cursor];
  };

  /** Visible issue ids in the current team/pane ordering. */
  readonly visibleIds = (): readonly string[] => {
    const teamId = this.currentTeamId();
    return teamId === null ? [] : this.viewOptions.visibleIds(teamId);
  };
}
