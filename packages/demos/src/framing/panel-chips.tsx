/**
 * Top-bar chips mirroring the bottom panel's contents.
 *
 * Two owners, one row of chips: whether a panel EXISTS is the workspace tree
 * in `WorkbenchService`; whether the bottom-panel REGION is visible is
 * `LayoutService`. Turning a chip on edits the tree and, if needed, opens the
 * region — each write going to the state that owns it.
 */
import { For, type JSX } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { LayoutService } from 'wheel/kit';
import { Button } from 'wheel/components';

import styles from './framing.module.css';
import {
  DOCK_PANEL_CATALOG,
  WorkbenchService
} from './services/workbench-service';

const connectPanelChips = connect('FramingPanelChips', (c) => {
  const workbench = c.service(WorkbenchService);
  const layout = c.service(LayoutService);
  return view(
    {
      openPanels: workbench.openPanels,
      regionOpen: () => layout.node('bottom-panel')?.open ?? false
    },
    {
      toggle: (panelId: string) => {
        const opening = !workbench.openPanels().includes(panelId);
        workbench.toggleDockPanel(panelId);
        // Turning a chip on while the region is hidden would change nothing
        // visible; opening the region is part of the chip's meaning.
        if (opening && !(layout.node('bottom-panel')?.open ?? false)) {
          layout.open('bottom-panel');
        }
      }
    }
  );
});

/** One toggle chip per catalog panel, pressed while that panel is open. */
export function PanelChips(): JSX.Element {
  const state = connectPanelChips({});
  return (
    <div
      use:componentRoot
      class={styles.controlGroup}
      data-testid="panel-chips"
    >
      <span class={styles.controlLabel}>Bottom panel</span>
      <For each={DOCK_PANEL_CATALOG}>
        {(entry) => (
          <Button data-wheel-role="chip"
            type="button"
            class={styles.chip}
            data-testid={`chip-${entry.panelId}`}
            aria-pressed={state.openPanels.includes(entry.panelId)}
            onClick={() => state.toggle(entry.panelId)}
          >
            {entry.title}
          </Button>
        )}
      </For>
    </div>
  );
}
