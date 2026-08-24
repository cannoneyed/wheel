/**
 * The whole layout, as JSX. This file IS the layout definition.
 *
 * There is no separate frame description, no node graph, no view registry.
 * Every region is a `Frame.Row`/`Frame.Column` with an `id`, and from that one
 * id it gets resize handles, min/max clamping, open/closed state, persistence,
 * and a live record in `LayoutService` — none of which is wired here.
 *
 * The editor row shows the division of labor at its sharpest: the SET of panes
 * is a `<For>` over `WorkbenchService.editors`, so opening, closing, and
 * reordering panes are edits to a list, not calls into a layout engine.
 */
import { For, type JSX } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { Frame } from 'wheel/kit';

import { DockWorkspace } from './dock-workspace';
import styles from './framing.module.css';
import { DrawerPane, EditorPane, ExplorerPane, OutlinePane } from './panes';
import {
  WorkbenchService,
  editorFrameId
} from './services/workbench-service';

const connectFramingWorkbench = connect('FramingWorkbench', (c) => {
  const workbench = c.service(WorkbenchService);
  return view(
    { editors: workbench.editors },
    {
      reorderEditors: workbench.reorderEditors,
      closeEditor: workbench.closeEditor
    }
  );
});

/** The VS Code-shaped shell: sidebar, editor row, bottom dock, outline, drawer. */
export function FramingWorkbench(): JSX.Element {
  const state = connectFramingWorkbench({});
  return (
    <div use:componentRoot class={styles.workbench}>
      <Frame.Row id="shell">
        <Frame.Column
          id="sidebar"
          size="240px"
          minSize="160px"
          maxSize="420px"
          collapseBelow="760px"
          class={styles.sidebarFrame}
        >
          <ExplorerPane />
        </Frame.Column>

        <Frame.Column id="work" size="1fr" minSize="320px">
          {/* More panes than fit stay reachable: `scrollable` hides the
              native scrollbar and draws the framework's permanent one. */}
          <Frame.Row
            id="editors"
            size="1fr"
            minSize="140px"
            onReorder={(ids) => state.reorderEditors(ids)}
            scrollable="x"
          >
            <For each={state.editors}>
              {(editor) => (
                <Frame.Column
                  id={editorFrameId(editor.id)}
                  size="1fr"
                  minSize="90px"
                  draggable
                  class={styles.editorFrame}
                >
                  <EditorPane
                    editor={editor}
                    onClose={() => state.closeEditor(editor.id)}
                  />
                </Frame.Column>
              )}
            </For>
          </Frame.Row>

          <Frame.Column
            id="bottom-panel"
            size="190px"
            minSize="90px"
            maxSize="380px"
            class={styles.panelFrame}
          >
            <DockWorkspace />
          </Frame.Column>
        </Frame.Column>

        <Frame.Column
          id="outline"
          size="220px"
          minSize="150px"
          maxSize="360px"
          class={styles.outlineFrame}
        >
          <OutlinePane />
        </Frame.Column>

        <Frame.Drawer
          id="inspector-drawer"
          side="right"
          size="300px"
          label="Inspector drawer"
          class={styles.drawerFrame}
        >
          <DrawerPane />
        </Frame.Drawer>
      </Frame.Row>
    </div>
  );
}
