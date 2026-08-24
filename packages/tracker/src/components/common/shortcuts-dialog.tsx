/**
 * The keyboard-shortcuts dialog, rendered FROM the
 * KeyboardService's own registration table — the help screen cannot drift
 * from what is actually registered, because it has no other source.
 */
import { For } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { KeyboardService } from 'wheel/kit';

import styles from './shortcuts-dialog.module.css';

const connectShortcutsDialog = connect('ShortcutsDialog', (c) => {
  const keyboardService = c.service(KeyboardService);
  return view({
    // `registrations`, not `bindingsFor`: the help lists what EXISTS, not
    // what would fire under the current gates.
    bindings: keyboardService.registrations
  });
});

const PRETTY: Record<string, string> = { arrowdown: '↓', arrowup: '↑', arrowleft: '←', arrowright: '→', escape: 'esc', space: '␣' };

function prettyKey(combo: string): string {
  return combo
    .split('+')
    .map((part) => PRETTY[part] ?? (part === 'mod' ? '⌘' : part))
    .join(' + ');
}

/** Dialog content listing every described binding. */
export function ShortcutsDialog() {
  const state = connectShortcutsDialog({});
  const described = () => state.bindings.filter((binding) => binding.description !== undefined);
  return (
    <div use:componentRoot class={styles.dialog} role="dialog" aria-modal="true">
      <h2 class={styles.title}>Keyboard shortcuts</h2>
      <div class={styles.grid}>
        <For each={described()}>
          {(binding) => (
            <div class={styles.row}>
              <kbd class={styles.key}>{prettyKey(binding.key)}</kbd>
              <span class={styles.description}>{binding.description}</span>
            </div>
          )}
        </For>
      </div>
      <div class={styles.footer}>Rendered live from KeyboardService.bindingsFor — it cannot go stale.</div>
    </div>
  );
}
