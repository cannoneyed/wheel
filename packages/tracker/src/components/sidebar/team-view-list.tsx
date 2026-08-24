/**
 * One team's saved views in the sidebar: click applies the
 * snapshot to this pane's filters, ✕ deletes (undoable).
 */
import { For } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { ViewService } from '../../services/view-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import styles from './sidebar.module.css';

const connectTeamViewList = connect(
  (props: { teamId: string }) => `TeamViewList:${props.teamId}`,
  (c, props: { teamId: string }) => {
    const viewService = c.service(ViewService);
    const interactionService = c.service(IssueInteractionService);
    return view(
      { views: () => viewService.viewsFor(props.teamId) },
      {
        apply: interactionService.applyView,
        remove: interactionService.deleteView
      }
    );
  }
);

/** Saved-view links under a team's section. */
export function TeamViewList(props: { teamId: string }) {
  const state = connectTeamViewList(props);
  return (
    <For each={state.views}>
      {(saved) => (
        <div use:componentRoot class={styles.favoriteRow}>
          <button class={styles.subItem} onClick={() => state.apply(props.teamId, saved.id)}>
            ⧉ {saved.name}
          </button>
          <button class={styles.favoriteTool} title="Delete view" onClick={() => state.remove(saved.id)}>
            ✕
          </button>
        </div>
      )}
    </For>
  );
}
