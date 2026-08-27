/**
 * The component inspector: draw a rectangle, get every connected
 * component under it, inspect any of them live.
 *
 * - `InspectorService` owns the state (mode, selection rect, hits,
 *   highlight) and the hit-testing: instance DOM comes from the registry
 *   (`use:componentRoot`), rects are measured at QUERY time — nothing is
 *   cached, so scroll/resize can't go stale.
 * - `<InspectorSystem/>` renders the chrome: the drag overlay while
 *   selecting, the results panel while inspecting. Mount once next to the
 *   other systems. No keyboard shortcut is registered by default — enter
 *   through the debug panel's ◰ button or `InspectorService.start()`.
 * - `highlight()` outlines a component's elements in place (inset outline —
 *   zero layout shift). It lives on the SERVICE so the debug panel's
 *   hover-to-locate works even when no InspectorSystem is mounted.
 */
// wheel-component-root: inspector chrome — must not appear in its own hit-tests
// wheel-view-root: debug chrome — must not appear in the tree it renders
// wheel-raw-signal: same reason — this chrome registers no instance, so a
// named signal would be recorded against whatever app component happens to
// be its nearest registered ancestor
import { For, Show, createEffect, createSignal, onCleanup, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

import { Service } from '../core/services';
import { connect } from '../core/connect';
import { view } from '../core/view';
import type { InstanceRecord } from '../core/debug-registry';

/** A viewport-space rectangle (CSS pixels, left/top origin). */
export interface SelectionRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** One hit-test result row: the instance plus its nesting depth among the hits (for tree indentation). */
export interface InspectorHit {
  readonly instanceId: string;
  readonly name: string;
  readonly depth: number;
}

function rectsIntersect(a: SelectionRect, b: DOMRect): boolean {
  return a.left < b.right && a.left + a.width > b.left && a.top < b.bottom && a.top + a.height > b.top;
}

function domDepth(element: Element): number {
  let depth = 0;
  let current: Element | null = element;
  while (current) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

/** Global inspector state + hit-testing (see module doc). */
export class InspectorService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'InspectorService';

  /** State-tree group: debug tooling — hidden from the panel it powers. */
  static override group = 'debug';

  // Doctrine: atoms hold DATA (ids, rects); element handles stay in the
  // registry's plain records, and the highlight restore closures live here
  // in a plain field.
  /** Current mode: off / selecting (overlay up, dragging) / inspecting (results panel up). */
  readonly mode = this.atom<'off' | 'selecting' | 'inspecting'>('off', 'mode');
  /** The picked rectangle (viewport coordinates), while inspecting. */
  readonly selectionRect = this.atom<SelectionRect | null>(null, 'selectionRect');
  /** Hit instances, innermost-first, with nesting depth among the hits. */
  readonly hits = this.atom<readonly InspectorHit[]>([], 'hits');
  /** The instance currently highlighted on the page (debug-panel hover or panel hover). */
  /**
   * What is outlined right now.
   *
   * A LIST, because a tree row can stand for many components: hovering
   * `TabsPanel[]` has to show all eight panels, not one of them and not
   * nothing. Empty means nothing is outlined.
   */
  readonly highlighted = this.atom<readonly string[]>([], 'highlighted');
  private readonly restoreHighlight = this.field<(() => void) | null>(null);


  /** Enter selection mode: the overlay comes up and the next drag picks. */
  readonly start = this.action(() => {
    this.mode.set('selecting');
  }, 'start');

  /** Leave the inspector entirely (Escape, close button). Clears any highlight. */
  readonly exit = this.action(() => {
    this.mode.set('off');
    this.selectionRect.set(null);
    this.hits.set([]);
    this.highlight(null);
  }, 'exit');

  /**
   * Hit-test a rectangle against every mounted instance: an instance is hit
   * when ANY of its registered elements intersects the rect (the
   * Figma-marquee convention). Rects are measured now, not cached. Results
   * sort innermost-first; `depth` counts how many other HITS contain the
   * instance, which is exactly the indentation of a containment tree.
   */
  readonly pick = this.action((rect: SelectionRect) => {
    const instances = this.context.registry.instances();
    const hit: Array<{ record: InstanceRecord; element: Element }> = [];
    for (const record of instances) {
      for (const element of record.elements) {
        if (element.isConnected && rectsIntersect(rect, element.getBoundingClientRect())) {
          hit.push({ record, element });
          break;
        }
      }
    }
    const results: InspectorHit[] = hit
      .map(({ record, element }) => ({
        instanceId: record.instanceId,
        name: record.name,
        depth: hit.filter((other) => other.record !== record && other.element.contains(element)).length,
        domDepth: domDepth(element)
      }))
      .sort((a, b) => b.domDepth - a.domDepth)
      .map(({ instanceId, name, depth }) => ({ instanceId, name, depth }));
    this.selectionRect.set(rect);
    this.hits.set(results);
    this.mode.set('inspecting');
  }, 'pick');

  /**
   * Outline an instance's elements in place — inset outline, ZERO layout
   * shift — or clear with null. Imperative DOM chrome, deliberately in the
   * service so the debug panel's hover-to-locate works with no
   * InspectorSystem mounted.
   */
  readonly highlight = this.action((target: string | readonly string[] | null) => {
    this.restoreHighlight.get()?.();
    this.restoreHighlight.set(null);
    const ids = target === null ? [] : typeof target === 'string' ? [target] : [...target];
    this.highlighted.set(ids);
    const restores: Array<() => void> = [];
    for (const instanceId of ids) {
      const record = this.instance(instanceId);
      if (!record) {
        continue;
      }
      for (const element of record.elements) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        const previous = { outline: element.style.outline, offset: element.style.outlineOffset };
        element.style.outline = '2px solid var(--wheel-indigo-bright, #6366f1)';
        element.style.outlineOffset = '-2px';
        restores.push(() => {
          element.style.outline = previous.outline;
          element.style.outlineOffset = previous.offset;
        });
      }
    }
    if (restores.length > 0) {
      this.restoreHighlight.set(() => restores.forEach((restore) => restore()));
    }
  }, 'highlight');

  /** Look up a mounted instance record (live state, elements) by id. */
  instance(instanceId: string): InstanceRecord | undefined {
    return this.context.registry.instances().find((record) => record.instanceId === instanceId);
  }
}

const panelStyles = {
  overlay: {
    position: 'fixed',
    inset: '0',
    'z-index': 10_500,
    cursor: 'crosshair',
    // Raw rgba on purpose: this wash sits over the page being inspected and
    // must stay see-through.
    // wheel-color: --wheel-scrim is modal-strength and would hide the thing the drag aims at
    background: 'rgba(15,18,24,0.12)'
  },
  band: {
    position: 'absolute',
    border: '1px solid var(--wheel-indigo-bright, #6366f1)',
    // wheel-color: the marquee fill must stay translucent over the page being inspected
    background: 'rgba(99,102,241,0.12)',
    'pointer-events': 'none'
  },
  hint: {
    position: 'fixed',
    top: '14px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--wheel-stage-4, #1a1d23)',
    color: 'var(--wheel-stage-ink-strong, #e5e7eb)',
    'border-radius': '8px',
    padding: '6px 14px',
    'font-size': '12px',
    'font-family': 'ui-monospace, monospace'
  },
  panel: {
    position: 'fixed',
    top: '12px',
    right: '12px',
    'z-index': 10_600,
    width: '320px',
    'max-height': '80vh',
    overflow: 'auto',
    background: 'var(--wheel-stage-2, #101317)',
    color: 'var(--wheel-stage-ink-strong, #e5e7eb)',
    border: '1px solid var(--wheel-stage-line-strong, #2a2f3a)',
    'border-radius': '10px',
    'font-family': 'ui-monospace, monospace',
    'font-size': '12px',
    'box-shadow': 'var(--wheel-shadow-menu, 0 12px 32px rgba(0,0,0,0.35))'
  },
  panelHeader: {
    display: 'flex',
    'align-items': 'center',
    gap: '8px',
    padding: '8px 12px',
    'border-bottom': '1px solid var(--wheel-stage-line-strong, #2a2f3a)'
  },
  headerButton: {
    'margin-left': 'auto',
    background: 'none',
    border: '1px solid var(--wheel-stage-line-strong, #2a2f3a)',
    color: 'var(--wheel-stage-ink-strong, #e5e7eb)',
    'border-radius': '6px',
    padding: '2px 8px',
    cursor: 'pointer'
  },
  hitRow: {
    padding: '6px 12px',
    cursor: 'pointer',
    'border-bottom': '1px solid var(--wheel-stage-line, #1c2027)'
  },
  hitName: { color: 'var(--wheel-indigo-edge, #93c5fd)', 'font-weight': 700 },
  dim: { color: 'var(--wheel-stage-ink-faint, #8b93a3)' },
  state: {
    margin: '6px 0 2px',
    padding: '6px 8px',
    background: 'var(--wheel-stage-0, #0a0c10)',
    'border-radius': '6px',
    'white-space': 'pre-wrap',
    'word-break': 'break-word',
    'max-height': '200px',
    overflow: 'auto'
  },
  logButton: {
    background: 'none',
    border: '1px solid var(--wheel-stage-line-strong, #2a2f3a)',
    color: 'var(--wheel-stage-ink-faint, #8b93a3)',
    'border-radius': '5px',
    padding: '1px 7px',
    cursor: 'pointer',
    'font-size': '11px'
  }
} satisfies Record<string, JSX.CSSProperties>;

const connectInspectorSystem = connect('InspectorSystem', (c) => {
  const inspectorService = c.service(InspectorService);
  return view(
    {
      mode: inspectorService.mode,
      hits: inspectorService.hits
    },
    {
      pick: inspectorService.pick,
      exit: inspectorService.exit,
      highlight: inspectorService.highlight,
      instance: (instanceId: string) => inspectorService.instance(instanceId)
    }
  );
}, { group: 'framework' });

function formatState(record: InstanceRecord): string {
  try {
    return JSON.stringify(record.state(), null, 1);
  } catch (error) {
    return `<state read failed: ${error instanceof Error ? error.message : String(error)}>`;
  }
}

/** One hit row: name + live state (expand) + hover-to-locate + log. Shared with the docked panel's inspect section. */
export function HitRow(props: {
  hit: InspectorHit;
  instance: (id: string) => InstanceRecord | undefined;
  highlight: (id: string | null) => void;
}): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const record = (): InstanceRecord | undefined => props.instance(props.hit.instanceId);
  return (
    <div
      style={{ ...panelStyles.hitRow, 'padding-left': `${12 + props.hit.depth * 14}px` }}
      onMouseEnter={() => props.highlight(props.hit.instanceId)}
      onMouseLeave={() => props.highlight(null)}
      onClick={() => setOpen(!open())}
    >
      <span style={panelStyles.hitName}>{props.hit.instanceId}</span>{' '}
      <span style={panelStyles.dim}>{open() ? '▾' : '▸'}</span>
      <Show when={open() && record()}>
        {(instanceRecord) => (
          <div>
            <pre style={panelStyles.state}>{formatState(instanceRecord())}</pre>
            <Show when={instanceRecord().actions.length > 0}>
              <div style={panelStyles.dim}>actions: {instanceRecord().actions.join(', ')}</div>
            </Show>
            <button
              type="button"
              style={panelStyles.logButton}
              onClick={(event) => {
                event.stopPropagation();
                // wheel-console: this button's entire purpose is dropping the object into devtools
                console.log(`[wheel inspect] ${props.hit.instanceId}`, instanceRecord().state());
              }}
            >
              log to console
            </button>
          </div>
        )}
      </Show>
    </div>
  );
}

/**
 * The inspector chrome: drag overlay + results panel. Mount once, next to
 * the other systems. Renders nothing while the inspector is off.
 * `hideResults` suppresses the floating results panel for hosts that render
 * the hits themselves (WheelApp's docked inspect section) — the drag overlay
 * and Escape handling stay.
 */
export function InspectorSystem(props: { hideResults?: boolean } = {}): JSX.Element {
  const state = connectInspectorSystem(props);
  // Drag coordinates are ephemeral view state — plain signals; the RESULT
  // (rect + hits) lives in the service.
  const [dragStart, setDragStart] = createSignal<{ x: number; y: number } | null>(null);
  const [dragNow, setDragNow] = createSignal<{ x: number; y: number } | null>(null);

  const band = (): SelectionRect | null => {
    const start = dragStart();
    const now = dragNow();
    if (!start || !now) return null;
    return {
      left: Math.min(start.x, now.x),
      top: Math.min(start.y, now.y),
      width: Math.abs(start.x - now.x),
      height: Math.abs(start.y - now.y)
    };
  };

  const finishDrag = (): void => {
    const rect = band();
    setDragStart(null);
    setDragNow(null);
    if (rect) {
      // A bare click picks a point: give it a tiny probe rectangle.
      state.pick(rect.width < 3 && rect.height < 3 ? { ...rect, width: 3, height: 3 } : rect);
    }
  };

  // listener boundary: Escape exits whenever the inspector is active; bound
  // at the document while mounted, gated by mode inside the handler.
  createEffect(() => {
    if (state.mode === 'off') return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        state.exit();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  return (
    <>
      <Show when={state.mode === 'selecting'}>
        <Portal>
          <div
            style={panelStyles.overlay}
            data-testid="wheel-inspector-overlay"
            onPointerDown={(event) => {
              setDragStart({ x: event.clientX, y: event.clientY });
              setDragNow({ x: event.clientX, y: event.clientY });
            }}
            onPointerMove={(event) => {
              if (dragStart()) setDragNow({ x: event.clientX, y: event.clientY });
            }}
            onPointerUp={finishDrag}
          >
            <Show when={band()}>
              {(rect) => (
                <div
                  style={{
                    ...panelStyles.band,
                    left: `${rect().left}px`,
                    top: `${rect().top}px`,
                    width: `${rect().width}px`,
                    height: `${rect().height}px`
                  }}
                />
              )}
            </Show>
          </div>
          <div style={panelStyles.hint}>drag a rectangle over components — Escape exits</div>
        </Portal>
      </Show>
      <Show when={state.mode === 'inspecting' && !props.hideResults}>
        <Portal>
          <div style={panelStyles.panel} data-testid="wheel-inspector-panel">
            <div style={panelStyles.panelHeader}>
              <span>◰</span>
              <strong>{state.hits.length} components</strong>
              <button type="button" style={panelStyles.headerButton} onClick={() => state.exit()}>
                ✕
              </button>
            </div>
            <Show when={state.hits.length === 0}>
              <div style={{ ...panelStyles.hitRow, cursor: 'default' }}>
                <span style={panelStyles.dim}>
                  nothing here — connected components mark their DOM with use:componentRoot
                </span>
              </div>
            </Show>
            <For each={state.hits}>
              {(hit) => <HitRow hit={hit} instance={state.instance} highlight={state.highlight} />}
            </For>
          </div>
        </Portal>
      </Show>
    </>
  );
}
