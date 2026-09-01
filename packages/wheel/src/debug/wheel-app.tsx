/**
 * <WheelApp/> — the app root that ships the whole debug story in one wrapper:
 *
 *   <WheelApp client={client}>
 *     <YourApp />
 *   </WheelApp>
 *
 * It mounts the provider (WheelProvider with a client, clientless
 * ServiceProvider without), and — in dev mode only — the debug surfaces:
 *
 * - the debug panel, CHROME-DEVTOOLS STYLE: a fixed full-height column
 *   pinned to the viewport's right edge, resizable by dragging its left
 *   border (width persisted). Two modes the header toggles between:
 *   `panel` SQUASHES THE WHOLE PAGE over (a margin on the document element —
 *   works no matter where in the tree WheelApp mounts), `overlay` floats
 *   over the page without moving it;
 * - four stacked sections on a FIXED grid (state tree / components /
 *   inspect / errors) — each scrolls independently, so expanding content in
 *   one section never shifts another;
 * - `<InspectorSystem/>` (its floating results panel suppressed — results
 *   render in the inspect section) and the snapshot marquee;
 * - error capture and the `window.__wheel` agent bridge.
 *
 * The app's children are rendered UNWRAPPED — WheelApp adds no layout
 * around them, so opening, closing, resizing, or re-docking the panel never
 * remounts or reflows the app subtree itself (docked mode only pushes the
 * document margin). Production builds render children directly; none of
 * this exists there.
 *
 * The floating `<WheelDebugPanel/>` widget remains the fallback chrome for
 * hosts that can't wrap their root (docs embeds, sandboxes). Same sections,
 * same storage keys — the two chromes agree on open state.
 */
// wheel-view-root: debug chrome — must not appear in the tree it renders
// wheel-untracked-show: debug chrome — excluded from the component tree it renders
// wheel-raw-signal: same reason — this chrome registers no instance, so a
// named signal would be recorded against whatever app component happens to
// be its nearest registered ancestor
import { createContext, createEffect, createSignal, onCleanup, useContext, For, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

import type { ContextClient, ServiceContext } from '../core/services';
import type { SyncClient } from '../sync/client/client';
import { WheelProvider, ServiceProvider } from '../core/connect';
import { WheelContext } from '../core/context';
import { DebugChrome } from '../core/connect';
import { debugPanes, type DebugPane } from './panes';
import { isWheelDevMode } from '../core/dev-mode';

import { installWheelBridge } from './bridge';
import { startErrorCapture } from './error-capture';
import { ErrorSection } from './error-section';
import { ComponentTreeSection } from './component-tree';
import {
  ClientSections,
  ServiceStateSection,
  createExpandState,
  sectionStyles
} from './panel-sections';

const OPEN_KEY = 'wheel.debug-panel.open';
const MODE_KEY = 'wheel.debug-panel.mode';
const WIDTH_KEY = 'wheel.debug-panel.width';
const MIN_WIDTH = 280;
const MAX_WIDTH = 940;
const DEFAULT_WIDTH = 420;

type DockMode = 'panel' | 'overlay';

function readStored(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null; // storage unavailable (SSR, privacy mode)
  }
}

function store(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // storage unavailable — state stays in-memory
  }
}

function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

const dockStyles = {
  dock: {
    position: 'fixed',
    top: '0',
    right: '0',
    bottom: '0',
    'z-index': 9500,
    display: 'flex',
    'flex-direction': 'column',
    background: 'var(--wheel-stage-5, #202124)',
    'border-left': '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    color: 'var(--wheel-stage-ink, #d7d3cc)',
    'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    'font-size': '11px'
  },
  // Raw shadow: the dock casts LEFT, over the app. --wheel-shadow-menu is
  // the only dark-surface shadow and drops straight down.
  // wheel-color: a downward token shadow would move it off the edge it exists to define
  overlayShadow: { 'box-shadow': '-12px 0 32px rgba(0,0,0,0.35)' },
  resizeHandle: {
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: '-4px',
    width: '8px',
    cursor: 'ew-resize',
    'z-index': 1
  },
  header: {
    display: 'flex',
    gap: '8px',
    'align-items': 'center',
    padding: '6px 10px',
    'border-bottom': '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    color: 'var(--wheel-stage-ink-strong, #fbfaf7)',
    'flex-shrink': '0'
  },
  headerButton: {
    padding: '2px 8px',
    color: 'var(--wheel-stage-ink, #d7d3cc)',
    background: 'none',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    'border-radius': '6px',
    cursor: 'pointer',
    font: 'inherit'
  },
  /**
   * The panes stack in a flex column with USER-OWNED weights, each pane
   * scrolling on its own. Content growth inside one pane can never move or
   * scroll another — expanding a component-tree node only scrolls the
   * components pane — and dragging the divider between two panes moves
   * space from one to the other without touching the rest.
   */
  sections: {
    display: 'flex',
    'flex-direction': 'column',
    flex: '1 1 auto',
    'min-height': '0'
  },
  sectionPane: {
    'overflow-y': 'auto',
    padding: '4px 10px 8px',
    'min-height': '0'
  },
  paneHandle: {
    flex: '0 0 5px',
    cursor: 'ns-resize',
    background: 'var(--wheel-stage-line-strong, #2a2f3a)'
  },
  /** The pane switcher: one toggle per pane, always visible above them. */
  paneBar: {
    display: 'flex',
    gap: '4px',
    padding: '4px 8px',
    'border-bottom': '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    'flex-shrink': '0'
  },
  paneToggle: {
    display: 'flex',
    'align-items': 'center',
    gap: '4px',
    padding: '1px 7px',
    'border-radius': '5px',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    cursor: 'pointer',
    font: 'inherit',
    'font-size': '10px'
  },
  chip: {
    position: 'fixed',
    right: '12px',
    bottom: '12px',
    'z-index': 9499,
    display: 'flex',
    'align-items': 'center',
    gap: '6px',
    padding: '5px 10px',
    color: 'var(--wheel-stage-ink, #d7d3cc)',
    background: 'var(--wheel-stage-5, #202124)',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    'border-radius': '6px',
    cursor: 'pointer',
    'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    'font-size': '11px'
  },
  statusColors: {
    connecting: 'var(--wheel-warn-ink, #b45309)',
    connected: 'var(--wheel-ok-soft, #2dd4bf)',
    reconnecting: 'var(--wheel-warn-ink, #b45309)',
    offline: 'var(--wheel-danger-deep, #b91c1c)'
  } as Record<string, string>
} satisfies Record<string, JSX.CSSProperties | Record<string, string>>;

/**
 * The dock's own panes, in display order.
 *
 * `inspect` used to sit between components and errors: a region select and a
 * rich screenshot. Annotation does both and then says what the app DID, so the
 * pane it left behind is contributed by the annotator through
 * `registerDebugPane` — the dock cannot import it (the DAG runs annotate →
 * debug), and does not need to.
 */
const BUILT_IN_PANES: readonly DebugPane[] = [
  { id: 'state', label: 'state', icon: '≡', weight: 5, render: () => null },
  { id: 'components', label: 'components', icon: '⌸', weight: 5, render: () => null },
  { id: 'errors', label: 'errors', icon: '⚠', weight: 2, render: () => null }
];

type PaneId = string;

const VISIBLE_KEY = 'wheel.debug-panel.panes';
const WEIGHTS_KEY = 'wheel.debug-panel.weights';

function readJson<T>(key: string, fallback: T): T {
  const raw = readStored(key);
  if (raw === null) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback; // corrupt entry: fall back rather than break the panel
  }
}

/** The dock's content: header, the pane switcher, and the resizable panes. */
function DockPanel(props: {
  services: ServiceContext;
  client: SyncClient | null;
  mode: () => DockMode;
  setMode: (mode: DockMode) => void;
  close: () => void;
}): JSX.Element {
  const ex = createExpandState();
  // Built-ins first, then contributed panes, so the annotator's pane lands
  // where `inspect` used to be rather than at the end.
  const allPanes = (): readonly DebugPane[] => {
    const contributed = debugPanes();
    const errors = BUILT_IN_PANES.filter((pane) => pane.id === 'errors');
    const rest = BUILT_IN_PANES.filter((pane) => pane.id !== 'errors');
    return [...rest, ...contributed, ...errors];
  };
  // A pane that has never been seen before shows by default — a contributed
  // pane must not arrive hidden behind a toggle nobody knows to press.
  const [visible, setVisible] = createSignal(readJson<Record<PaneId, boolean>>(VISIBLE_KEY, {}));
  const [weights, setWeights] = createSignal(readJson<Record<PaneId, number>>(WEIGHTS_KEY, {}));
  const isVisible = (pane: DebugPane): boolean => visible()[pane.id] ?? true;
  const weightOf = (pane: DebugPane): number => weights()[pane.id] ?? pane.weight;
  const shown = (): readonly DebugPane[] => allPanes().filter(isVisible);
  const togglePane = (pane: DebugPane): void => {
    const next = { ...visible(), [pane.id]: !isVisible(pane) };
    setVisible(next);
    store(VISIBLE_KEY, JSON.stringify(next));
  };

  let sectionsHost: HTMLDivElement | undefined;
  /**
   * Drag a divider: the two panes it sits between trade weight, everything
   * else holds still. Weights are relative, so the split survives a panel
   * resize; the 0.5 floor keeps a pane from collapsing to nothing.
   */
  const beginPaneResize = (event: PointerEvent, index: number): void => {
    const handle = event.currentTarget as HTMLElement;
    const panes = shown();
    const above = panes[index - 1];
    const below = panes[index];
    if (!above || !below) return;
    const host = sectionsHost;
    if (!host) return;
    handle.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startAbove = weights()[above.id];
    const startBelow = weights()[below.id];
    const total = startAbove + startBelow;
    const span = host.getBoundingClientRect().height || 1;
    const onMove = (move: PointerEvent): void => {
      const shift = ((move.clientY - startY) / span) * (total + 2);
      const nextAbove = Math.max(0.5, Math.min(total - 0.5, startAbove + shift));
      setWeights((current) => ({ ...current, [above.id]: nextAbove, [below.id]: total - nextAbove }));
    };
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      store(WEIGHTS_KEY, JSON.stringify(weights()));
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  };

  const rev = (): number => props.services.trackVersion();
  const seq = (): number => {
    rev();
    return props.client?.seq() ?? 0;
  };
  const pending = (): number => {
    rev();
    return props.client?.pendingMutations() ?? 0;
  };
  const status = (): string => {
    rev();
    return props.client?.connectionStatus() ?? 'offline';
  };
  return (
    <>
      <div style={dockStyles.header}>
        <span>🥝</span>
        <strong>wheel</strong>
        <Show when={props.client !== null}>
          <span style={sectionStyles.badge}>seq {seq()}</span>
          <span style={sectionStyles.dim}>{pending()} pending</span>
          <span style={{ color: dockStyles.statusColors[status()] }}>{status()}</span>
        </Show>
        <span style={{ 'margin-left': 'auto' }} />
        <button
          type="button"
          style={dockStyles.headerButton}
          onClick={() => props.setMode(props.mode() === 'panel' ? 'overlay' : 'panel')}
          data-testid="wheel-debug-mode"
          aria-label={props.mode() === 'panel' ? 'switch to overlay mode' : 'switch to docked mode'}
          title={props.mode() === 'panel' ? 'float over the app' : 'dock beside the app'}
        >
          {props.mode() === 'panel' ? '⧉' : '▤'}
        </button>
        <button
          type="button"
          style={dockStyles.headerButton}
          onClick={props.close}
          data-testid="wheel-debug-toggle"
          aria-label="close debug panel"
        >
          ▾
        </button>
      </div>
      <div style={dockStyles.paneBar}>
        <For each={allPanes()}>
          {(pane) => (
            <button
              type="button"
              style={{
                ...dockStyles.paneToggle,
                color: isVisible(pane)
                  ? 'var(--wheel-stage-ink, #d7d3cc)'
                  : 'var(--wheel-stage-ink-dim, #6b7280)',
                background: isVisible(pane) ? 'var(--wheel-stage-hover, rgba(99,102,241,0.15))' : 'none'
              }}
              onClick={() => togglePane(pane)}
              aria-pressed={isVisible(pane)}
              data-testid={`wheel-pane-toggle-${pane.id}`}
              title={`${isVisible(pane) ? 'hide' : 'show'} ${pane.label}`}
            >
              <span>{pane.icon}</span>
              <span>{pane.label}</span>
            </button>
          )}
        </For>
      </div>
      {/* Everything below is TOOLING. It is built from the same kit and
          component library an app uses — deliberately, because the panel
          should live on the parts it exists to show — and `DebugChrome` keeps
          that furniture out of the component tree it is drawing. */}
      <DebugChrome>
      <div style={dockStyles.sections} ref={(element) => (sectionsHost = element)}>
        <For each={shown()}>
          {(pane, index) => (
            <>
              {/* Divider between two visible panes: drags space from one to
                  the other, leaving every other pane untouched. */}
              <Show when={index() > 0}>
                <div
                  style={dockStyles.paneHandle}
                  data-testid={`wheel-pane-handle-${pane.id}`}
                  onPointerDown={(event) => beginPaneResize(event, index())}
                  aria-label={`resize ${pane.label} pane`}
                />
              </Show>
              <div
                style={{ ...dockStyles.sectionPane, flex: `${weightOf(pane)} 1 0` }}
                data-testid={`wheel-pane-${pane.id}`}
              >
                <Show when={pane.id === 'state'}>
                  <ServiceStateSection services={props.services} ex={ex} />
                  <ClientSections services={props.services} client={props.client} ex={ex} />
                </Show>
                <Show when={pane.id === 'components'}>
                  <ComponentTreeSection services={props.services} ex={ex} />
                </Show>
                <Show when={pane.id === 'errors'}>
                  <ErrorSection ex={ex} />
                </Show>
                {pane.render(props.services)}
              </div>
            </>
          )}
        </For>
      </div>
      </DebugChrome>
    </>
  );
}

/** Dev-mode shell: unwrapped children, the fixed dock, the systems, the bridge. */
function DevShell(props: { children: JSX.Element }): JSX.Element {
  const context = useContext(WheelContext)!;
  const { services } = context;
  const client = context.client as SyncClient | null;

  onCleanup(installWheelBridge(context));
  // Capture starts at APP mount — errors thrown while the dock is closed
  // still land in the buffer (window-scoped, idempotent, never uninstalled).
  startErrorCapture();

  const [open, setOpen] = createSignal(readStored(OPEN_KEY) === 'open');
  const [mode, setModeSignal] = createSignal<DockMode>(readStored(MODE_KEY) === 'overlay' ? 'overlay' : 'panel');
  const [width, setWidthSignal] = createSignal(clampWidth(Number(readStored(WIDTH_KEY)) || DEFAULT_WIDTH));
  const toggle = (next: boolean): void => {
    setOpen(next);
    store(OPEN_KEY, next ? 'open' : 'closed');
  };
  const setMode = (next: DockMode): void => {
    setModeSignal(next);
    store(MODE_KEY, next);
  };
  const setWidth = (next: number): void => {
    setWidthSignal(clampWidth(next));
  };

  // Imperative boundary: docked mode squashes the WHOLE PAGE (chrome-devtools
  // style) by pushing the document element's margin — the one lever that works
  // regardless of where in the tree WheelApp mounts. Overlay/closed restores it.
  createEffect(() => {
    const squash = open() && mode() === 'panel';
    document.documentElement.style.marginRight = squash ? `${width()}px` : '';
    onCleanup(() => {
      document.documentElement.style.marginRight = '';
    });
  });

  const beginResize = (event: PointerEvent): void => {
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent): void => setWidth(window.innerWidth - move.clientX);
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      store(WIDTH_KEY, String(width()));
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  };

  return (
    <>
      {props.children}
      <Show when={open()}>
        <Portal>
          <div
            style={{
              ...dockStyles.dock,
              ...(mode() === 'overlay' ? dockStyles.overlayShadow : {}),
              width: `${width()}px`
            }}
            data-testid="wheel-debug-panel"
          >
            <div
              style={dockStyles.resizeHandle}
              onPointerDown={beginResize}
              data-testid="wheel-debug-resize"
              aria-label="resize debug panel"
            />
            <DockPanel
              services={services}
              client={client}
              mode={mode}
              setMode={setMode}
              close={() => toggle(false)}
            />
          </div>
        </Portal>
      </Show>
      <Show when={!open()}>
        <button
          type="button"
          style={dockStyles.chip}
          onClick={() => toggle(true)}
          data-testid="wheel-debug-toggle"
          aria-label="open debug panel"
        >
          🥝 wheel
        </button>
      </Show>
    </>
  );
}

/**
 * The host app tree, with dev chrome when dev mode is active.
 *
 * This component boundary is intentional. Solid reads Show branches inside
 * a memo. Passing the host tree through that memo can create another live app
 * with its own services and body portals. A component body runs untracked, so
 * this boundary reads the host tree once for each provider instance.
 *
 * Dev mode is a module flag, not a signal. A plain branch gives the same
 * fixed-at-mount behavior without another reactive boundary.
 */
/**
 * Marks that a dock is already above this point in the tree.
 *
 * `WheelApp` nests legitimately — the website embeds live demos, and each one
 * is a real app with its own client — but a dock is PAGE chrome, and three
 * fixed docks stacked in the same corner is just three of them. The outermost
 * shell owns it; inner ones provide their context and nothing else.
 */
const DockPresent = createContext(false);

function AppTree(props: { children: JSX.Element }): JSX.Element {
  const nested = useContext(DockPresent);
  if (!isWheelDevMode() || nested) return props.children;
  return (
    <DockPresent.Provider value={true}>
      <DevShell>{props.children}</DevShell>
    </DockPresent.Provider>
  );
}

/**
 * The app root wrapper: provider + (dev only) the docked debug panel,
 * inspector, and agent bridge. See the module doc for the full story.
 */
export function WheelApp(props: {
  /** The app's sync client; omit for pure-local (clientless) apps. */
  client?: ContextClient | null;
  /** Scope id for the clientless provider (default 'root'). */
  scopeId?: string;
  children: JSX.Element;
}): JSX.Element {
  return (
    <Show
      when={props.client ?? null}
      fallback={
        <ServiceProvider scopeId={props.scopeId ?? 'root'}>
          <AppTree>{props.children}</AppTree>
        </ServiceProvider>
      }
    >
      {(client) => (
        <WheelProvider client={client()}>
          <AppTree>{props.children}</AppTree>
        </WheelProvider>
      )}
    </Show>
  );
}
