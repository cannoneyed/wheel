/**
 * The dock panel's ⋯ menu — an ordinary connected component, portaled by
 * `ContextMenuSystem`, per-instance named so each open menu is auditable.
 * Closing a panel is an edit to the workspace tree, not a layout call.
 */
import type { JSX } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { ContextMenuService } from 'wheel/kit';

import styles from './framing.module.css';
import { WorkbenchService } from './services/workbench-service';

const connectDockPanelMenu = connect(
  (props: { panelId: string }) => `contextMenu:dock:${props.panelId}`,
  (c, props) => {
    const workbench = c.service(WorkbenchService);
    const contextMenuService = c.service(ContextMenuService);
    return view(
      {},
      {
        closePanel: () => workbench.closePanel(props.panelId),
        closeMenu: contextMenuService.close
      }
    );
  }
);

/** Menu content for one dock panel: today just Close, wired for more. */
export function DockPanelMenu(props: { panelId: string }): JSX.Element {
  const state = connectDockPanelMenu(props);
  return (
    <div use:componentRoot class={styles.panelMenu}>
      <button
        type="button"
        class={styles.panelMenuItem}
        data-testid={`close-panel-${props.panelId}`}
        onClick={() => {
          state.closePanel();
          state.closeMenu();
        }}
      >
        Close panel
      </button>
    </div>
  );
}
