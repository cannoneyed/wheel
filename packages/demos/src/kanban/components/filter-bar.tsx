/**
 * The tag-filter bar. Connects through FilterService — the cherry-picked
 * filter surface — not BoardService directly, so sandboxes can fake the one
 * service this component knows.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { Button } from 'wheel/components';

import { FilterService } from '../services/filter-service';
import styles from './filter-bar.module.css';

const connectFilterBar = connect('FilterBar', (c) => {
  const filter = c.service(FilterService);
  return view(
    {
      tags: () => filter.tags(),
      active: () => filter.active()
    },
    { apply: filter.apply, clear: filter.clear }
  );
});

/** One toggle button per distinct tag, plus a clear button while filtered. */
export function FilterBar() {
  const state = connectFilterBar({});
  return (
    <div use:componentRoot class={styles.bar}>
      <span class={styles.label}>Filter by tag:</span>
      <For each={state.tags}>
        {(tag) => (
          <Button
            classList={{ [styles.tagActive]: state.active === tag }}
            onClick={() => (state.active === tag ? state.clear() : state.apply(tag))}
          >
            {tag}
          </Button>
        )}
      </For>
      <Show when={state.active !== null}>
        <Button onClick={() => state.clear()}>clear</Button>
      </Show>
    </div>
  );
}
