/**
 * The dock workspace's ☰ menu: one checkable entry per catalog panel and a
 * reset below a divider. Toggling an entry keeps the menu open (it is a
 * checklist, not a command); reset closes it.
 */
import { For, type JSX } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { ContextMenuService } from 'wheel/kit';

import styles from './framing.module.css';
import {
  DOCK_PANEL_CATALOG,
  WorkbenchService
} from './services/workbench-service';

const connectWorkspaceMenu = connect('WorkspaceMenu', (c) => {
  const workbench = c.service(WorkbenchService);
  const contextMenuService = c.service(ContextMenuService);
  return view(
    { openPanels: workbench.openPanels },
    {
      togglePanel: workbench.toggleDockPanel,
      reset: workbench.resetWorkspace,
      closeMenu: contextMenuService.close
    }
  );
});

/** Menu content for the workspace: panel checklist, divider, reset. */
export function WorkspaceMenu(): JSX.Element {
  const state = connectWorkspaceMenu({});
  return (
    <div use:componentRoot class={styles.panelMenu}>
      <For each={DOCK_PANEL_CATALOG}>
        {(entry) => (
          <button
            type="button"
            role="menuitemcheckbox"
            class={styles.panelMenuItem}
            aria-checked={state.openPanels.includes(entry.panelId)}
            data-testid={`workspace-panel-${entry.panelId}`}
            onClick={() => state.togglePanel(entry.panelId)}
          >
            <span class={styles.panelMenuCheck}>
              {state.openPanels.includes(entry.panelId) ? '✓' : ''}
            </span>
            {entry.title}
          </button>
        )}
      </For>
      <div class={styles.panelMenuDivider} />
      <button
        type="button"
        class={styles.panelMenuItem}
        data-testid="workspace-reset"
        onClick={() => {
          state.reset();
          state.closeMenu();
        }}
      >
        Reset workspace
      </button>
    </div>
  );
}
