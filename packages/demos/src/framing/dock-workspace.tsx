/**
 * The opt-in free-form docking region.
 *
 * `Frame.Dock` renders a tree it does not own and never mutates: the tree is a
 * plain-JSON atom in `WorkbenchService`, a completed drop arrives here as a
 * `DockIntent`, and an app action applies it with the pure `applyDockIntent`
 * reducer. Drag a panel's grip onto another panel's edge to create a split
 * that did not exist in any source file.
 */
import { Show, type JSX } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { contextMenu, ContextMenuService, Frame } from 'wheel/kit';

import styles from './framing.module.css';
import { DockPanel } from './panes';
import { WorkbenchService } from './services/workbench-service';
import { WorkspaceMenu } from './workspace-menu';

const connectDockWorkspace = connect('DockWorkspace', (c) => {
  const workbench = c.service(WorkbenchService);
  const contextMenuService = c.service(ContextMenuService);
  return view(
    { workspace: workbench.workspace },
    {
      applyDock: workbench.applyDock,
      openMenu: (id: string, point: { x: number; y: number }) =>
        contextMenuService.open(id, point)
    }
  );
});

/** The bottom panel's dock: app-owned tree in, drop intents out. */
export function DockWorkspace(): JSX.Element {
  const state = connectDockWorkspace({});
  return (
    <div use:componentRoot class={styles.dockHost}>
      <div class={styles.dockBar}>
        <span class={styles.dockLabel}>Dock workspace</span>
        <span class={styles.dockHint}>
          Drag a panel grip onto another panel&apos;s edge
        </span>
        <button
          type="button"
          class={styles.smallButton}
          aria-label="Workspace menu"
          data-testid="workspace-menu"
          use:contextMenu={{
            id: 'dock-workspace',
            menu: () => <WorkspaceMenu />,
            anchor: 'element'
          }}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            state.openMenu('dock-workspace', { x: rect.left, y: rect.bottom + 4 });
          }}
        >
          ☰
        </button>
      </div>
      <Show
        when={state.workspace}
        keyed
        fallback={
          <p class={styles.dockEmpty} data-testid="dock-empty">
            Every panel is closed. Use the Bottom panel chips above to reopen
            one — the dock is just app state, so an empty dock can say so.
          </p>
        }
      >
        {(tree) => (
          <Frame.Dock
            tree={tree}
            onIntent={state.applyDock}
            panel={(leaf, drag) => (
              <DockPanel
                panelId={leaf.panelId}
                grip={drag.grip}
                dragging={drag.dragging}
                onMenu={(point) => state.openMenu(`dock-panel:${leaf.panelId}`, point)}
              />
            )}
          />
        )}
      </Show>
    </div>
  );
}
