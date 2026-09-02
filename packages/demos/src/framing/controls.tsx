/**
 * The header buttons — every one of them a service call by frame id.
 *
 * No refs, no layout props, no imperative handles. "Toggle the sidebar" is
 * `layout.toggle('sidebar')`, which is why the same button works from a
 * keybinding, a command palette, or a test that never touches the DOM.
 */
import type { JSX } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { LayoutService } from 'wheel/kit';
import { Button } from 'wheel/components';

import styles from './framing.module.css';
import { PanelChips } from './panel-chips';
import { WorkbenchService } from './services/workbench-service';

// wheel-connect-surface: the demo's one control bar spans every region toggle
// plus the editor structure controls; splitting it would scatter the header.
const connectFramingControls = connect('FramingControls', (c) => {
  const layout = c.service(LayoutService);
  const workbench = c.service(WorkbenchService);
  // `node(id)` is null while a frame is unmounted; reads never throw.
  return view(
    {
      sidebarOpen: () => layout.node('sidebar')?.open ?? false,
      // Open but not visible = responsive collapse; the toggle can do nothing.
      sidebarAutoHidden: () => {
        const node = layout.node('sidebar');
        return node !== null && node.open && !node.visible;
      },
      panelOpen: () => layout.node('bottom-panel')?.open ?? false,
      outlineOpen: () => layout.node('outline')?.open ?? false,
      drawerOpen: () => layout.node('inspector-drawer')?.open ?? false,
      editorCount: workbench.editorCount
    },
    {
      toggleSidebar: () => layout.toggle('sidebar'),
      togglePanel: () => layout.toggle('bottom-panel'),
      toggleOutline: () => layout.toggle('outline'),
      toggleDrawer: () => layout.toggle('inspector-drawer'),
      resetLayout: () => layout.reset(),
      openEditor: workbench.openEditor,
      fitEditors: workbench.fitEditors
    }
  );
});

/** Region toggles, a pane opener, and the one-call layout reset. */
export function FramingControls(): JSX.Element {
  const state = connectFramingControls({});
  return (
    <div use:componentRoot class={styles.controls} data-testid="framing-controls">
      <div class={styles.controlGroup}>
        <span class={styles.controlLabel}>Regions</span>
        <Button data-wheel-role="toggle-sidebar"
          type="button"
          data-testid="toggle-sidebar"
          aria-pressed={state.sidebarOpen}
          disabled={state.sidebarAutoHidden}
          title={
            state.sidebarAutoHidden
              ? 'The sidebar is auto-hidden at this width; widen the stage to bring it back'
              : undefined
          }
          onClick={() => state.toggleSidebar()}
        >
          ◧ {state.sidebarOpen ? 'Hide' : 'Show'} sidebar
        </Button>
        <Button data-wheel-role="toggle-panel"
          type="button"
          data-testid="toggle-panel"
          aria-pressed={state.panelOpen}
          onClick={() => state.togglePanel()}
        >
          ▤ {state.panelOpen ? 'Hide' : 'Show'} bottom panel
        </Button>
        <Button data-wheel-role="toggle-outline"
          type="button"
          data-testid="toggle-outline"
          aria-pressed={state.outlineOpen}
          onClick={() => state.toggleOutline()}
        >
          ◨ {state.outlineOpen ? 'Hide' : 'Show'} outline
        </Button>
        <Button data-wheel-role="toggle-drawer"
          type="button"
          data-testid="toggle-drawer"
          aria-pressed={state.drawerOpen}
          onClick={() => state.toggleDrawer()}
        >
          ▸ {state.drawerOpen ? 'Close' : 'Open'} drawer
        </Button>
      </div>

      <PanelChips />

      <div class={styles.controlGroup}>
        <span class={styles.controlLabel}>Structure</span>
        <Button data-wheel-role="new-editor"
          type="button"
          data-testid="new-editor"
          onClick={() => state.openEditor()}
        >
          ＋ New pane
        </Button>
        <Button data-wheel-role="fit-editors"
          type="button"
          data-testid="fit-editors"
          title="Share the row evenly: the largest widths that fit, or each pane's minimum"
          onClick={() => state.fitEditors()}
        >
          ⇥ Fit widths
        </Button>
        <span class={styles.controlReadout} data-testid="editor-count">
          {state.editorCount} open
        </span>
      </div>

      <Button data-wheel-role="reset-layout"
        type="button"
        class={styles.resetButton}
        data-testid="reset-layout"
        onClick={() => state.resetLayout()}
      >
        Reset layout
      </Button>
    </div>
  );
}
