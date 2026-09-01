/**
 * <WheelDebugPanel /> — wheel's runtime audit surface as a drop-in FLOATING
 * widget (🐛, fixed bottom-right): the registry's service → primitive graph
 * with live values, component dependency manifests, the client's collection
 * cache, and the provenance change stream. Ships with the library because
 * extreme debuggability is the product, not demo garnish. Self-contained
 * inline styles; open/closed state persists in localStorage.
 *
 * This is the FALLBACK chrome — docs embeds and sandboxes that don't wrap
 * their root in `<WheelApp/>` mount this. Apps on WheelApp get the docked,
 * resizable panel instead; both render the same sections from
 * `panel-sections.tsx`.
 */
// wheel-view-root: debug chrome — must not appear in the tree it renders
// wheel-raw-signal: same reason — this chrome registers no instance, so a
// named signal would be recorded against whatever app component happens to
// be its nearest registered ancestor
import { createSignal, onCleanup, useContext, Show, type JSX } from 'solid-js';

import type { SyncConnectionStatus } from '../sync/client/transport';
import type { SyncClient } from '../sync/client/client';
import { WheelContext } from '../core/context';

import { InspectorService } from './inspector';
import { installWheelBridge } from './bridge';
import { startErrorCapture } from './error-capture';
import { ErrorSection } from './error-section';
import {
  ClientSections,
  ComponentManifestSection,
  ServiceStateSection,
  createExpandState
} from './panel-sections';

const STORAGE_KEY = 'wheel.debug-panel.open';

function readStoredOpen(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === 'open';
  } catch {
    return false; // storage unavailable (SSR, privacy mode) — start collapsed
  }
}

function storeOpen(open: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, open ? 'open' : 'closed');
  } catch {
    // storage unavailable — open state stays in-memory
  }
}

const STATUS_COLORS: Record<SyncConnectionStatus, string> = {
  connecting: 'var(--wheel-warn-ink, #b45309)',
  connected: 'var(--wheel-ok-soft, #2dd4bf)',
  reconnecting: 'var(--wheel-warn-ink, #b45309)',
  offline: 'var(--wheel-danger-deep, #b91c1c)'
};

// The panel is an INSTRUMENT surface: deliberately dark whatever the app's
// theme is doing. So it reads the FIXED `--wheel-stage-*` / status tokens, not
// the theme aliases — and every value keeps the original literal as its
// fallback, so a host that never imports `wheel/styles` looks unchanged.
const styles = {
  root: {
    position: 'fixed',
    right: '12px',
    bottom: '12px',
    'z-index': 9999,
    'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    'font-size': '11px',
    color: 'var(--wheel-stage-ink, #d7d3cc)'
  },
  toggle: {
    display: 'flex',
    'align-items': 'center',
    gap: '6px',
    'margin-left': 'auto',
    padding: '5px 10px',
    color: 'var(--wheel-stage-ink, #d7d3cc)',
    background: 'var(--wheel-stage-5, #202124)',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    'border-radius': '6px',
    cursor: 'pointer',
    font: 'inherit'
  },
  panel: {
    width: '380px',
    'max-height': '50vh',
    display: 'flex',
    'flex-direction': 'column',
    background: 'var(--wheel-stage-5, #202124)',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    'border-radius': '8px',
    'box-shadow': 'var(--wheel-shadow-menu, 0 8px 24px rgba(0,0,0,0.35))',
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    gap: '10px',
    'align-items': 'center',
    padding: '6px 10px',
    'border-bottom': '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    color: 'var(--wheel-stage-ink-strong, #fbfaf7)'
  },
  headerButton: {
    'margin-left': 'auto',
    padding: '2px 8px',
    color: 'var(--wheel-stage-ink, #d7d3cc)',
    background: 'none',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    'border-radius': '6px',
    cursor: 'pointer',
    font: 'inherit'
  },
  badge: { color: 'var(--wheel-ok-soft, #2dd4bf)' },
  dim: { color: 'var(--wheel-stage-ink-faint, #8b8b8b)' },
  body: { 'overflow-y': 'auto', padding: '6px 10px 10px' }
} satisfies Record<string, JSX.CSSProperties>;

/**
 * The drop-in runtime audit widget (🐛, fixed bottom-right): registry state
 * tree with live values, component manifests, and — when the provider is
 * client-backed — the collection cache and the color-coded provenance change
 * stream. Clientless ServiceProviders get the registry sections only.
 */
export function WheelDebugPanel(): JSX.Element {
  const context = useContext(WheelContext);
  if (!context) {
    throw new Error('WheelDebugPanel used outside a WheelProvider/ServiceProvider');
  }
  // The context holds the narrow `ContextClient` seam (core must not name the
  // sync client). The debug panel renders the full client's surface, and debug
  // is allowed to know `sync` — narrow it back here, the same move SyncService
  // makes at its boundary.
  const { services } = context;
  const client = context.client as SyncClient | null;

  // Mounting the panel also opens the agent door: window.__wheel (dev-gated
  // inside install) and starts error capture (window-scoped, idempotent).
  onCleanup(installWheelBridge(context));
  startErrorCapture();

  const [isOpen, setOpen] = createSignal(readStoredOpen());
  const ex = createExpandState();
  const toggle = (): void => {
    const next = !isOpen();
    setOpen(next);
    storeOpen(next);
  };

  const rev = (): number => services.trackVersion();
  const seq = (): number => {
    rev();
    return client?.seq() ?? 0;
  };
  const pending = (): number => {
    rev();
    return client?.pendingMutations() ?? 0;
  };
  const status = (): SyncConnectionStatus => {
    rev();
    return client?.connectionStatus() ?? 'offline';
  };

  return (
    <div style={styles.root} data-testid="wheel-debug">
      <Show
        when={isOpen()}
        fallback={
          <button
            type="button"
            style={styles.toggle}
            onClick={toggle}
            data-testid="wheel-debug-toggle"
            aria-label="open debug panel"
          >
            🐛 wheel
          </button>
        }
      >
        <div style={styles.panel} data-testid="wheel-debug-panel">
          <div style={styles.header}>
            <span>🐛</span>
            <strong>wheel</strong>
            <Show when={client !== null}>
              <span style={styles.badge}>seq {seq()}</span>
              <span style={styles.dim}>{pending()} pending</span>
              <span style={{ color: STATUS_COLORS[status()] }}>{status()}</span>
            </Show>
            <button
              type="button"
              style={styles.headerButton}
              onClick={() => services.get(InspectorService).start()}
              data-testid="wheel-debug-inspect"
              aria-label="inspect components (draw a rectangle)"
              title="inspect components: draw a rectangle"
            >
              ◰
            </button>
            <button
              type="button"
              style={styles.headerButton}
              onClick={toggle}
              data-testid="wheel-debug-toggle"
              aria-label="close debug panel"
            >
              ▾
            </button>
          </div>
          <div style={styles.body}>
            <ServiceStateSection services={services} ex={ex} defaultOpen />
            <ComponentManifestSection services={services} ex={ex} />
            <ClientSections services={services} client={client} ex={ex} />
            <ErrorSection ex={ex} />
          </div>
        </div>
      </Show>
    </div>
  );
}
