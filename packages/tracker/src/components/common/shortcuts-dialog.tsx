/**
 * The keyboard-shortcuts dialog, rendered FROM the
 * KeyboardService's own registration table (a command's keys register there
 * too, described by the command's title) — the help screen cannot drift
 * from what is actually registered, because it has no other source.
 */
import { For } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { KeyboardService, formatCombo } from 'wheel/kit';

import styles from './shortcuts-dialog.module.css';

const connectShortcutsDialog = connect('ShortcutsDialog', (c) => {
  const keyboardService = c.service(KeyboardService);
  return view({
    // `registrations`, not `bindingsFor`: the help lists what EXISTS, not
    // what would fire under the current gates.
    bindings: keyboardService.registrations
  });
});

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
              <kbd class={styles.key}>{formatCombo(binding.key)}</kbd>
              <span class={styles.description}>{binding.description}</span>
            </div>
          )}
        </For>
      </div>
      <div class={styles.footer}>Rendered live from KeyboardService.registrations — it cannot go stale.</div>
    </div>
  );
}
