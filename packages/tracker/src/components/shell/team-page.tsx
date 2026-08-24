/**
 * The team page: filter bar + list/board by route, plus the composer dialog
 * registration and the selection bar. Connecting IssueInteractionService here
 * also INSTANTIATES it, which registers the whole issue shortcut map before
 * any row is on screen.
 *
 * This is the `team` route's LAYOUT component, so it stays mounted while the
 * tab changes underneath it — the tab comes from the route NAME
 * (`team.board` → `board`), not from local state, which is what makes each tab
 * a linkable URL.
 */
import type { JSX } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import type { RouterService } from 'wheel/router';
import { Dialog } from 'wheel/kit';

import { trackerRouter, tabOf, type TrackerRoutes } from '../../routes';
import { TeamService } from '../../services/team-service';
import {
  IssueInteractionService,
  COMPOSER_DIALOG_ID,
  SAVE_VIEW_DIALOG_ID
} from '../../services/issue-interaction-service';
import { SelectionBar } from '../common/selection-bar';
import { IssueComposer } from '../common/issue-composer';
import { SaveViewDialog } from '../common/save-view-dialog';
import { TeamWorkspace } from './team-workspace';
import styles from './team-page.module.css';

const connectTeamPage = connect('TeamPage', (c) => {
  const router = c.service(trackerRouter.Service) as RouterService<TrackerRoutes>;
  const interactionService = c.service(IssueInteractionService);
  const teamService = c.service(TeamService);
  return view(
    {
      teamId: () => router.matchOf('team')?.params.teamId ?? '',
      tab: () => tabOf(router.routeName()),
      peekId: interactionService.peekId,
      teams: teamService.teams
    },
    { openComposer: interactionService.openComposer }
  );
});

/** One team's issues/board, addressed by the URL. */
export function TeamPage(): JSX.Element {
  const state = connectTeamPage({});
  return (
    <div use:componentRoot class={styles.page}>
      <TeamWorkspace
        teamId={state.teamId}
        tab={state.tab}
        peekId={state.peekId}
        teams={state.teams}
        openComposer={state.openComposer}
      />
      <SelectionBar />
      <Dialog id={COMPOSER_DIALOG_ID} content={() => <IssueComposer teamId={state.teamId} />} />
      <Dialog id={SAVE_VIEW_DIALOG_ID} content={() => <SaveViewDialog />} />
    </div>
  );
}
