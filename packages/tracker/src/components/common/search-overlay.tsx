/**
 * The search overlay: mod+/ opens, results are LIVE (the custom
 * QueryHandler re-runs while you look at them), enter opens the top hit.
 */
import { For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Show, componentRoot, connect, view } from 'wheel/core';

import { SearchService } from '../../services/search-service';
import { TeamService } from '../../services/team-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import styles from './search-overlay.module.css';

const connectSearchOverlay = connect('SearchOverlay', (c) => {
  const searchService = c.service(SearchService);
  const teamService = c.service(TeamService);
  const interactionService = c.service(IssueInteractionService);
  return view(
    {
      isOpen: searchService.isOpen,
      query: searchService.query,
      results: searchService.results
    },
    {
      close: searchService.close,
      setQuery: searchService.setQuery,
      teamKey: (teamId: string) => teamService.team(teamId)?.key ?? '',
      openIssue: (issueId: string) => {
        searchService.close();
        interactionService.openFull(issueId);
      }
    }
  );
});

/** The one search host. Mount once inside the provider. */
export function SearchOverlay() {
  const state = connectSearchOverlay({});
  return (
    <Show when={state.isOpen}>
      <Portal>
        <div
          use:componentRoot
          class={styles.scrim}
          onClick={(event) => {
            if (event.target === event.currentTarget) state.close();
          }}
        >
          <div class={styles.panel}>
            <input
              class={styles.input}
              placeholder="Search issues and comments…"
              value={state.query}
              onInput={(event) => state.setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') state.close();
                else if (event.key === 'Enter' && state.results.length > 0) {
                  state.openIssue(state.results[0].id);
                }
              }}
              ref={(element) => {
                // dom boundary: the overlay just opened; focus the input.
                queueMicrotask(() => element.focus());
              }}
            />
            <div class={styles.results}>
              <For each={state.results}>
                {(result) => (
                  <button class={styles.result} onClick={() => state.openIssue(result.id)}>
                    <span class={styles.source}>{result.source === 'comment' ? '💬' : '◆'}</span>
                    <span class={styles.resultTitle}>{result.title}</span>
                    <span class={styles.team}>{state.teamKey(result.teamId)}</span>
                  </button>
                )}
              </For>
              <Show when={state.query.trim().length >= 2 && state.results.length === 0}>
                <div class={styles.empty}>No matches (results stay live — keep it open and edit something).</div>
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
