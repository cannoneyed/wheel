/**
 * The framing demo's own state — which is to say, its STRUCTURE.
 *
 * Framing v3 splits ownership down one line: the app owns structure, framing
 * owns geometry. So "which editors are open, in what order" and "what shape is
 * the docked workspace" are ordinary atoms in this service, rendered as
 * ordinary JSX. How wide each pane is, and whether the sidebar is open, live
 * in `LayoutService` keyed by frame id. Neither one knows about the other, and
 * there is nothing to reconcile.
 */
import { Service } from 'wheel/core';
import {
  applyDockIntent,
  LayoutService,
  panelIds,
  removePanel,
  type DockIntent,
  type SplitTree
} from 'wheel/kit';

/** One open editor pane. Its `id` becomes a frame id; that is the only link. */
export interface WorkbenchEditor {
  /** Stable identity; the frame id is `editor-<id>`. */
  readonly id: string;
  /** File name shown in the pane's drag grip. */
  readonly title: string;
  /** Shown in the pane header. */
  readonly language: string;
  /** Editable body text, so a moved pane can be seen keeping its own state. */
  readonly body: string;
}

const EDITOR_FRAME_PREFIX = 'editor-';

/** The frame id for one editor: layout key, action target, and test hook. */
export function editorFrameId(editorId: string): string {
  return `${EDITOR_FRAME_PREFIX}${editorId}`;
}

/** The editor id inside a frame id, or null when the id is not an editor's. */
export function editorIdOfFrame(frameId: string): string | null {
  return frameId.startsWith(EDITOR_FRAME_PREFIX)
    ? frameId.slice(EDITOR_FRAME_PREFIX.length)
    : null;
}

const DEFAULT_EDITORS: readonly WorkbenchEditor[] = [
  {
    id: 'app',
    title: 'app.tsx',
    language: 'tsx',
    body: [
      "import { Frame } from 'wheel/kit';",
      '',
      'export function AppShell() {',
      '  return (',
      '    <Frame.Row id="shell">',
      '      <Frame.Column id="nav" size="240px" />',
      '      <Frame.Column id="main" size="1fr" />',
      '    </Frame.Row>',
      '  );',
      '}'
    ].join('\n')
  },
  {
    id: 'layout',
    title: 'layout-service.ts',
    language: 'typescript',
    body: [
      '// Geometry has exactly one owner.',
      "layout.toggle('sidebar');",
      "layout.resize('sidebar', '320px');",
      'layout.reset();'
    ].join('\n')
  },
  {
    id: 'readme',
    title: 'README.md',
    language: 'markdown',
    body: [
      '# Framing',
      '',
      'Drag a pane by its grip to reorder it.',
      'Sizes and open state survive a reload.'
    ].join('\n')
  }
];

/**
 * The dock's starting shape: three sibling panels in a row.
 *
 * Plain JSON, stored in an app atom. It holds ids and nothing else — the panel
 * render prop turns an id into a component, so there is no view registry and
 * no params schema anywhere in this demo.
 */
const DEFAULT_WORKSPACE: SplitTree = {
  kind: 'split',
  id: 'dock-root',
  axis: 'row',
  children: [
    { kind: 'panel', id: 'dock-terminal', panelId: 'terminal' },
    { kind: 'panel', id: 'dock-problems', panelId: 'problems' },
    { kind: 'panel', id: 'dock-output', panelId: 'output' }
  ]
};

/** Every dock panel the demo knows how to render, chip label included. */
export const DOCK_PANEL_CATALOG: readonly {
  readonly panelId: string;
  readonly title: string;
}[] = [
  { panelId: 'terminal', title: 'Terminal' },
  { panelId: 'problems', title: 'Problems' },
  { panelId: 'output', title: 'Output' }
];

const MIN_STAGE_WIDTH = 560;
const MAX_STAGE_WIDTH = 1100;

/** Open editors, the dock tree, and the demo stage's width. */
export class WorkbenchService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'WorkbenchService';

  /** The open editor panes, in the order their frames render. */
  readonly editors = this.atom<readonly WorkbenchEditor[]>(
    DEFAULT_EDITORS,
    'editors'
  );

  /**
   * The app-owned dock tree `Frame.Dock` renders and reports drops against.
   * Null when every panel has been closed — an empty dock is app state like
   * any other, so the region can say so instead of rendering nothing.
   */
  readonly workspace = this.atom<SplitTree | null>(
    DEFAULT_WORKSPACE,
    'workspace'
  );

  /** The dock panels currently open, in tree order. Chips render from this. */
  readonly openPanels = this.computed(() => {
    const tree = this.workspace.get();
    return tree ? panelIds(tree) : [];
  }, 'openPanels');

  /**
   * Width of the demo stage in CSS pixels.
   *
   * Not a layout concern — it is the size of the CONTAINER the layout lives
   * in, which is exactly what `collapseBelow` reacts to. Shrinking it is how
   * the responsive collapse becomes visible without resizing the window.
   */
  readonly stageWidth = this.atom(MAX_STAGE_WIDTH, 'stageWidth');

  /** How many editor panes are open right now. */
  readonly editorCount = this.computed(
    () => this.editors.get().length,
    'editorCount'
  );

  /** Append one untitled editor; its frame appears because its data does. */
  readonly openEditor = this.action(() => {
    const editors = this.editors.get();
    let ordinal = 1;
    while (editors.some((editor) => editor.id === `untitled-${ordinal}`)) {
      ordinal += 1;
    }
    this.editors.set([
      ...editors,
      {
        id: `untitled-${ordinal}`,
        title: `untitled-${ordinal}.ts`,
        language: 'typescript',
        body: '// A new pane is a new list entry. No layout API was called.'
      }
    ]);
  }, 'openEditor');

  /** Close one editor; the last one stays so the split is never empty. */
  readonly closeEditor = this.action((editorId: string) => {
    const editors = this.editors.get();
    if (editors.length <= 1) return;
    this.editors.set(editors.filter((editor) => editor.id !== editorId));
  }, 'closeEditor');

  /**
   * Apply a completed reorder drag.
   *
   * `Frame.Row` ran the gesture and handed back the new DOM order of its child
   * FRAME ids. Turning that into the new editor order is this action's job —
   * the same list the `<For>` renders, so the panes follow.
   */
  readonly reorderEditors = this.action((frameIds: readonly string[]) => {
    const editors = this.editors.get();
    const byId = new Map(editors.map((editor) => [editor.id, editor]));
    const next: WorkbenchEditor[] = [];
    for (const frameId of frameIds) {
      const editorId = editorIdOfFrame(frameId);
      const editor = editorId === null ? undefined : byId.get(editorId);
      if (editor) next.push(editor);
    }
    if (next.length !== editors.length) return;
    this.editors.set(next);
  }, 'reorderEditors');

  /** Apply one dock drop to the tree. The reducer is pure; the action is ours. */
  readonly applyDock = this.action((intent: DockIntent) => {
    const tree = this.workspace.get();
    if (!tree) return;
    this.workspace.set(applyDockIntent(tree, intent));
  }, 'applyDock');

  /** Close one dock panel; closing the last one leaves the dock empty. */
  readonly closePanel = this.action((panelId: string) => {
    const tree = this.workspace.get();
    if (!tree) return;
    this.workspace.set(removePanel(tree, panelId));
  }, 'closePanel');

  /** Open one catalog panel; it lands as the last sibling of the root row. */
  readonly openPanel = this.action((panelId: string) => {
    const tree = this.workspace.get();
    if (tree && panelIds(tree).includes(panelId)) return;
    const panel: SplitTree = { kind: 'panel', id: `dock-${panelId}`, panelId };
    if (!tree) {
      this.workspace.set(panel);
      return;
    }
    if (tree.kind === 'split' && tree.axis === 'row') {
      this.workspace.set({ ...tree, children: [...tree.children, panel] });
      return;
    }
    this.workspace.set({
      kind: 'split',
      id: 'dock-root',
      axis: 'row',
      children: [tree, panel]
    });
  }, 'openPanel');

  /**
   * Put every editor pane back to `1fr`: they share the row evenly — the
   * largest sizes that fit without scrolling, or each pane's minimum when
   * even minimums overflow. When everything genuinely fits, the row is also
   * fit-LOCKED, so later structure changes keep it fitting. Structure is
   * ours; the widths belong to `LayoutService`, so this action crosses the
   * service boundary on purpose.
   */
  readonly fitEditors = this.action(() => {
    const layout = this.service(LayoutService);
    let minTotal = 0;
    for (const editor of this.editors.get()) {
      const frameId = editorFrameId(editor.id);
      if (!layout.has(frameId)) continue;
      layout.resize(frameId, '1fr');
      minTotal += layout.node(frameId)?.minSize ?? 0;
    }
    const container = layout.node('editors')?.pixels?.inlineSize ?? null;
    layout.setFitLocked(
      'editors',
      container !== null && minTotal <= container
    );
  }, 'fitEditors');

  /** Chip behavior: open the panel if absent, close it if present. */
  readonly toggleDockPanel = this.action((panelId: string) => {
    if (this.openPanels().includes(panelId)) {
      this.closePanel(panelId);
    } else {
      this.openPanel(panelId);
    }
  }, 'toggleDockPanel');

  /** Put the dock tree back to three siblings in a row. */
  readonly resetWorkspace = this.action(() => {
    this.workspace.set(DEFAULT_WORKSPACE);
  }, 'resetWorkspace');

  /** Resize the demo stage, clamped to the slider's range. */
  readonly setStageWidth = this.action((width: number) => {
    const clamped = Math.min(
      MAX_STAGE_WIDTH,
      Math.max(MIN_STAGE_WIDTH, Math.round(width))
    );
    this.stageWidth.set(clamped);
  }, 'setStageWidth');
}
