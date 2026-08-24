/**
 * The team workspace: the primary list/board, an optional issue peek, and an
 * optional scope-isolated second pane.
 *
 * Structure is app state rendered as JSX — the peek exists while the router
 * carries a peek id, the second pane exists while `SplitViewService` names a
 * team. Framing only owns their widths and resize behavior, by frame id.
 */
import { Match, Show, Switch, type JSX } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { Frame } from 'wheel/kit';

import { SplitViewService } from '../../services/split-view-service';
import { BoardView } from '../board/board-view';
import { CyclesPage } from '../cycles/cycles-page';
import { IssueDetail } from '../detail/issue-detail';
import { FilterBar } from '../list/filter-bar';
import { IssueList } from '../list/issue-list';
import { SplitPane } from './split-pane';
import styles from './team-page.module.css';

interface TeamWorkspaceProps {
  readonly teamId: string;
  readonly tab: string;
  readonly peekId: string | null;
  readonly teams: readonly { readonly id: string }[];
  readonly openComposer: () => void;
}

const connectTeamWorkspace = connect(
  'TeamWorkspace',
  (c, _props: TeamWorkspaceProps) => {
    const splitView = c.service(SplitViewService);
    return view(
      { splitTeamId: splitView.splitTeamId },
      { openSplit: splitView.openSplit, closeSplit: splitView.closeSplit }
    );
  }
);

/** Team content, issue peek, and explicitly scoped second pane. */
export function TeamWorkspace(props: TeamWorkspaceProps): JSX.Element {
  const state = connectTeamWorkspace(props);

  const secondTeamId = () =>
    props.teams.find((team) => team.id !== props.teamId)?.id ?? props.teamId;

  return (
    <div use:componentRoot class={styles.workspace}>
      <div class={styles.toolbar}>
        <FilterBar />
        <Show
          when={state.splitTeamId === null}
          fallback={
            <button
              class={styles.splitButton}
              onClick={() => state.closeSplit()}
            >
              ◫ Close split
            </button>
          }
        >
          <button
            class={styles.splitButton}
            title="Open a second, independently-filtered pane"
            onClick={() => state.openSplit(secondTeamId())}
          >
            ◫ Split
          </button>
        </Show>
        <button
          class={styles.newIssue}
          title="New issue (c)"
          onClick={() => props.openComposer()}
        >
          + New issue
        </button>
      </div>
      <div class={styles.body}>
        <Frame.Row id="tracker-team">
          <Frame.Column id="tracker-primary" size="1fr" minSize="360px">
            <Switch>
              <Match when={props.tab === 'board'}>
                <BoardView teamId={props.teamId} />
              </Match>
              <Match when={props.tab === 'cycles'}>
                <CyclesPage teamId={props.teamId} />
              </Match>
              <Match when={true}>
                <IssueList teamId={props.teamId} />
              </Match>
            </Switch>
          </Frame.Column>
          <Show when={props.peekId}>
            {(peekId) => (
              <Frame.Column
                id="tracker-peek"
                size="420px"
                minSize="300px"
                maxSize="720px"
              >
                <aside class={styles.peek}>
                  <IssueDetail
                    teamId={props.teamId}
                    issueId={peekId()}
                    mode="peek"
                  />
                </aside>
              </Frame.Column>
            )}
          </Show>
          <Show when={state.splitTeamId}>
            {(splitTeamId) => (
              <Frame.Column
                id="tracker-secondary"
                size="420px"
                minSize="300px"
                maxSize="720px"
              >
                <SplitPane
                  teamId={splitTeamId()}
                  onClose={() => state.closeSplit()}
                />
              </Frame.Column>
            )}
          </Show>
        </Frame.Row>
      </div>
    </div>
  );
}
