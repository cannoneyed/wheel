/**
 * The Framing docking example: free-form, drag-anywhere panels where the split
 * tree is ordinary application state. `Frame.Dock` runs the drag interaction
 * and reports a drop as an intent; the application's action applies it with
 * the shipped pure reducers. The engine never mutates the tree.
 */
import type { JSX } from 'solid-js';
import { Service, componentRoot, connect, view } from 'wheel/core';
import {
  Frame,
  applyDockIntent,
  panelIds,
  removePanel,
  type DockIntent,
  type SplitTree
} from 'wheel/kit';

const DEFAULT_TREE: SplitTree = {
  kind: 'split',
  id: 'split-1',
  axis: 'row',
  children: [
    { kind: 'panel', id: 'leaf-notes', panelId: 'notes' },
    { kind: 'panel', id: 'leaf-preview', panelId: 'preview' }
  ]
};

// #region service
/**
 * The workspace tree lives here, not inside the layout engine. It is plain
 * JSON in an atom: it persists with your persistence, syncs with your sync,
 * undoes with your undo, and shows up in the debug graph as your own state.
 */
export class WorkspaceService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'WorkspaceService';

  readonly tree = this.atom<SplitTree>(DEFAULT_TREE, 'tree');

  /** Which panels are open, in tree order — a real derivation, so a computed. */
  readonly openPanels = this.computed(
    () => panelIds(this.tree.get()),
    'openPanels'
  );

  /** One completed drop. The reducer does the fiddly tree normalization. */
  readonly dock = this.action((intent: DockIntent) => {
    this.tree.set(applyDockIntent(this.tree.get(), intent));
  }, 'dock');

  /** Closing a panel is the same story in reverse. */
  readonly closePanel = this.action((panelId: string) => {
    this.tree.set(removePanel(this.tree.get(), panelId) ?? DEFAULT_TREE);
  }, 'closePanel');
}
// #endregion service

const panelStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  flex: '1 1 auto',
  'min-width': '0',
  'min-height': '0',
  background: 'var(--wheel-bg-raised)'
};

const gripStyle: JSX.CSSProperties = {
  display: 'flex',
  'justify-content': 'space-between',
  padding: '6px 8px',
  cursor: 'grab',
  background: 'var(--wheel-indigo-tint)',
  'font-size': '12px'
};

// #region dock
const connectWorkspace = connect('Workspace', (c) => {
  const workspace = c.service(WorkspaceService);
  return view(
    { tree: () => workspace.tree.get() },
    { dock: workspace.dock, closePanel: workspace.closePanel }
  );
});

/**
 * The tree stores ids; the `panel` render prop turns an id into a component,
 * the way JSX always has. `drag.grip` marks the element that starts a dock
 * drag — a title bar here — so the panel's own controls stay clickable.
 */
export function Workspace(): JSX.Element {
  const state = connectWorkspace({});
  return (
    <div use:componentRoot style={{ display: 'flex', flex: '1 1 auto' }}>
      <Frame.Dock
        tree={state.tree}
        onIntent={state.dock}
        panel={(leaf, drag) => (
          <section style={panelStyle} data-dragging={drag.dragging()}>
            <header ref={drag.grip} style={gripStyle}>
              <span>{leaf.panelId}</span>
              <button type="button" onClick={() => state.closePanel(leaf.panelId)}>
                ×
              </button>
            </header>
          </section>
        )}
      />
    </div>
  );
}
// #endregion dock
