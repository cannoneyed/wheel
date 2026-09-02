/**
 * The demo's pane contents — plain presentational components.
 *
 * None of them connects to a service, takes a layout prop, or knows it is
 * inside a frame. That is the point: in v3 a pane is just a component, so
 * there is no view type, no params schema, and no registry for any of this.
 */
import { For, type JSX } from 'solid-js';
import { contextMenu } from 'wheel/kit';
import { useSignal, viewRoot } from 'wheel/core';
import { Button } from 'wheel/components';

import { DockPanelMenu } from './dock-panel-menu';
import styles from './framing.module.css';
import type { WorkbenchEditor } from './services/workbench-service';

const FILES = [
  'src/app.tsx',
  'src/layout-service.ts',
  'src/frame.tsx',
  'src/split-tree.ts',
  'README.md'
];

/** Sidebar contents: a file tree that scrolls inside its own track. */
export function ExplorerPane(): JSX.Element {
  return (
    <div use:viewRoot={'ExplorerPane'} class={styles.explorerPane}>
      <div class={styles.paneHeading}>Explorer</div>
      <div class={styles.fileTree}>
        <strong>⌄ WHEEL</strong>
        <For each={FILES}>
          {(file) => <span class={styles.treeFile}>◇ {file}</span>}
        </For>
      </div>
      <p class={styles.paneNote}>
        A sidebar is not a special component — it is a pixel-sized column the
        app can close.
      </p>
    </div>
  );
}

/** One editor pane: a drag grip, a close button, and its own local draft. */
export function EditorPane(props: {
  readonly editor: WorkbenchEditor;
  readonly onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useSignal(props.editor.body, 'draft');
  return (
    <div use:viewRoot={{ name: 'EditorPane', props }} class={styles.editorPane}>
      <header class={styles.editorHeader}>
        {/* `data-frame-grip` narrows the reorder drag to this element, so the
            close button and the textarea keep working normally. */}
        <span
          class={styles.editorGrip}
          data-frame-grip
          data-testid={`grip-${props.editor.id}`}
          title="Drag to reorder"
        >
          ⠿ {props.editor.title}
        </span>
        <Button data-wheel-role="close"
          type="button"
          class={styles.paneClose}
          aria-label={`Close ${props.editor.title}`}
          data-testid={`close-${props.editor.id}`}
          onClick={() => props.onClose()}
        >
          ×
        </Button>
      </header>
      <textarea
        class={styles.editorSurface}
        spellcheck={false}
        aria-label={`Draft for ${props.editor.title}`}
        data-testid={`draft-${props.editor.id}`}
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
      />
      <footer class={styles.editorStatus}>
        <span>{props.editor.language}</span>
        <span>Ln {draft().split('\n').length}</span>
      </footer>
    </div>
  );
}

/** Right-hand outline column. */
export function OutlinePane(): JSX.Element {
  return (
    <div use:viewRoot={'OutlinePane'} class={styles.outlinePane}>
      <div class={styles.paneHeading}>Outline</div>
      <ul>
        <li>◇ Frame.Row</li>
        <li>　◇ Frame.Column</li>
        <li>　◇ Frame.Drawer</li>
        <li>　◇ Frame.Dock</li>
        <li>ƒ LayoutService.toggle</li>
        <li>ƒ LayoutService.reset</li>
      </ul>
    </div>
  );
}

interface DockPanelContent {
  readonly title: string;
  readonly lines: readonly string[];
}

const DOCK_PANELS: Readonly<Record<string, DockPanelContent>> = {
  terminal: {
    title: 'Terminal',
    lines: ['$ bun run check', '✓ geometry has one owner', '✓ 0 registries']
  },
  problems: {
    title: 'Problems',
    lines: ['⊗ 0 errors', '△ 0 warnings', 'Structure is your JSX.']
  },
  output: {
    title: 'Output',
    lines: [
      'dock: drop reported as an intent',
      'app: applyDockIntent(tree, intent)',
      'render: your tree, your atom'
    ]
  }
};

/**
 * One docked panel. Its header is the grip `Frame.Dock` drags it by; the ⋯
 * button (and a right-click anywhere on the panel) opens its actions menu.
 */
export function DockPanel(props: {
  readonly panelId: string;
  readonly grip: (element: HTMLElement) => void;
  readonly dragging: () => boolean;
  /** Open this panel's menu at a point; the workspace owns the service call. */
  readonly onMenu: (point: { x: number; y: number }) => void;
}): JSX.Element {
  const panel = (): DockPanelContent =>
    DOCK_PANELS[props.panelId] ?? { title: props.panelId, lines: [] };
  return (
    <div
      use:viewRoot={{ name: 'DockPanel', props }}
      class={styles.dockPanel}
      data-dragging={props.dragging() ? 'true' : undefined}
    >
      <header class={styles.dockHeader}>
        <div
          ref={props.grip}
          class={styles.dockGrip}
          data-testid={`dock-grip-${props.panelId}`}
          title="Drag onto another panel's edge"
        >
          ⠿ {panel().title}
        </div>
        {/* `anchor: 'element'` makes this a dropdown: it hangs off the button,
            tracks it while scrolling, and does not close on scroll. */}
        {/* Stays a native <button>: `use:contextMenu` is a Solid directive, and
            Solid only applies directives to native elements — on a component it
            compiles to nothing and the dropdown never opens. */}
        <button
          type="button"
          class={styles.paneMore}
          aria-label={`${panel().title} actions`}
          data-testid={`more-${props.panelId}`}
          use:contextMenu={{
            id: `dock-panel:${props.panelId}`,
            menu: () => <DockPanelMenu panelId={props.panelId} />,
            anchor: 'element'
          }}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            props.onMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          ⋯
        </button>
      </header>
      <div class={styles.dockBody}>
        <For each={panel().lines}>{(line) => <code>{line}</code>}</For>
      </div>
    </div>
  );
}

/** The drawer's contents: an overlay panel, not a track in the split. */
export function DrawerPane(): JSX.Element {
  return (
    <div use:viewRoot={'DrawerPane'} class={styles.drawerPane}>
      <div class={styles.paneHeading}>Inspector drawer</div>
      <p>
        A drawer overlays content from its side instead of taking space from its
        neighbours, so nothing reflows when it opens.
      </p>
      <p>
        It starts closed, remembers that choice, and opens from the same
        <code> layout.toggle(id)</code> every other frame uses.
      </p>
    </div>
  );
}
