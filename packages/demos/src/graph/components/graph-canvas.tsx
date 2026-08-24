/**
 * THE bridge: a three.js canvas driven by a rAF loop, wrapped by wheel.
 *
 * Read this file as four separated concerns, because keeping them separate is
 * the entire point:
 *
 *   1. PLAIN FIELDS the loop reads. `layout` (Float32Array buffers),
 *      `handle` (the WebGL renderer), `labels`, `viewportFrame`, drag state.
 *      None of these may ever go into an atom: `Atom.set` deep-freezes every
 *      write, so a frozen typed array stops accepting `x[i] = …` and a frozen
 *      WebGL handle is worse.
 *   2. REACTIVE → IMPERATIVE: one `createEffect` per boundary, each with a
 *      written reason, each doing nothing but copying reactive state into
 *      those plain fields. The effects are how the loop stays subscription-free.
 *   3. THE LOOP: `frame()` steps the simulation and returns a snapshot built
 *      only from plain fields. It is called ~60×/second and tracks NOTHING.
 *      If it read a signal even once, every mutation would invalidate the
 *      effect that owns the renderer and tear the canvas down mid-drag.
 *   4. IMPERATIVE → REACTIVE: pointer events become named service actions and
 *      nothing else. A drag publishes presence while it moves and commits
 *      exactly ONE `pin` mutation on release — one gesture, one undo step.
 */
import { Show, createEffect, onCleanup, onMount } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { GROUPS, GraphService, type LayoutProbe } from '../services/graph-service';
import { ViewportService } from '../services/viewport-service';
import { nodeAt, screenToWorld, type Viewport } from '../canvas/picking';
import {
  LAYOUT_SEED,
  createLayout,
  createRandom,
  dragTo,
  isSettled,
  reheat,
  stepLayout,
  type Layout
} from '../canvas/simulation';
import {
  NODE_RADIUS,
  createGraphCanvas,
  type GraphCanvasHandle,
  type GraphFrame,
  type GraphPalette,
  type PeerCursor
} from '../canvas/renderer';
import styles from '../graph.module.css';

/** Clicks land within this many world units of a node's centre. */
const PICK_RADIUS = NODE_RADIUS * 1.6;

/** One wheel notch scales the camera by this much. */
const ZOOM_STEP = 1.12;

const connectGraphCanvas = connect('GraphCanvas', (c) => {
  const graphService = c.service(GraphService);
  const viewportService = c.service(ViewportService);
  return view(
    {
      nodes: () => graphService.nodes.rows,
      edges: () => graphService.edges.rows,
      status: () => graphService.nodes.status,
      selectedId: graphService.selectedId,
      peers: graphService.peers,
      viewport: viewportService.viewport,
      settled: graphService.settled
    },
    {
      selectAt: graphService.selectAt,
      registerProbe: (probe: LayoutProbe) => graphService.registerProbe(probe),
      setSettled: graphService.setSettled,
      pin: graphService.pin,
      publishPointer: graphService.publishPointer,
      setSize: viewportService.setSize,
      panBy: viewportService.panBy,
      zoomAt: viewportService.zoomAt
    }
  );
});

/**
 * WebGL takes numbers, not CSS. So the palette is read off the element's own
 * computed style at mount — graph.module.css defines `--graph-*` in terms of
 * the real design tokens, and this is the one place they cross into GL.
 */
// wheel-color: last-resort literals for the --graph-* tokens below. They mirror the FIXED stage/indigo token values (the stage is dark in both themes) and are only reached if the stylesheet has not applied — WebGL cannot take `var(--x)` for an answer.
const PALETTE_FALLBACK = ['#10131c', '#363e50', '#818cf8', '#818cf8', '#34d399', '#f59e0b', '#c4b5fd'] as const;

/** Read the group/edge/background colors out of the CSS tokens on the element. */
function readPalette(element: HTMLElement): GraphPalette {
  const style = getComputedStyle(element);
  const token = (name: string, index: number): string =>
    style.getPropertyValue(name).trim() || PALETTE_FALLBACK[index];
  return {
    background: token('--graph-bg', 0),
    edge: token('--graph-edge', 1),
    accent: token('--graph-accent', 2),
    groups: [
      token('--graph-group-core', 3),
      token('--graph-group-ui', 4),
      token('--graph-group-data', 5),
      token('--graph-group-tools', 6)
    ]
  };
}

/** The WebGL stage plus its pointer surface. */
export function GraphCanvas() {
  const state = connectGraphCanvas({});
  let container!: HTMLDivElement;

  // ---- 1. plain fields: everything the loop touches ------------------------
  const random = createRandom(LAYOUT_SEED);
  let handle: GraphCanvasHandle | null = null;
  let layout: Layout = createLayout([], [], null, random);
  let labels: readonly string[] = [];
  let viewportFrame: Viewport = state.viewport;
  let selectedIdFrame: string | null = null;
  let peersFrame: readonly { clientId: string; color: string; x: number; y: number; draggingNodeId: string | null }[] =
    [];
  let settledMirror = false;
  /** The node this pointer is dragging (id + live world position), or null. */
  let dragId: string | null = null;
  let dragX = 0;
  let dragY = 0;
  let panning = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  /** Mirror the settled/running transition into the atom — never per frame. */
  const markSettled = (settled: boolean): void => {
    if (settledMirror !== settled) {
      settledMirror = settled;
      state.setSettled(settled);
    }
  };

  // ---- 2. reactive → imperative: one effect per boundary -------------------

  // imperative boundary: synced rows → the simulation's typed-array buffers.
  // Surviving nodes keep their live position and velocity, so adding or
  // deleting looks like an edit to a moving graph rather than a re-layout;
  // the layout reheats afterwards so it can settle into the new shape.
  createEffect(() => {
    const nodeRows = state.nodes;
    const edgeRows = state.edges;
    layout = createLayout(
      nodeRows.map((row) => ({
        id: row.id,
        group: Math.max(0, GROUPS.indexOf(row.group)),
        pinX: row.pinX,
        pinY: row.pinY
      })),
      edgeRows.map((row) => ({ from: row.from, to: row.to })),
      layout,
      random
    );
    labels = nodeRows.map((row) => row.label);
    reheat(layout);
    markSettled(false);
  });

  // imperative boundary: the selection atom → the frame's plain id. The INDEX
  // is resolved inside frame() against the current buffers, so a rebuild that
  // renumbers the nodes can never leave a stale ring on the wrong one.
  createEffect(() => {
    selectedIdFrame = state.selectedId;
  });

  // imperative boundary: peer presence → the frame's plain cursor list, so the
  // loop can draw peers without subscribing to the presence channel.
  createEffect(() => {
    peersFrame = state.peers;
  });

  // imperative boundary: the camera atom → the frame's plain viewport, read by
  // both the three.js camera and the DOM label overlay.
  createEffect(() => {
    viewportFrame = state.viewport;
  });

  // ---- 3. the loop: reads plain fields, tracks nothing ---------------------

  const frame = (): GraphFrame => {
    stepLayout(layout);
    const dragIndex = dragId === null ? -1 : (layout.indexOf.get(dragId) ?? -1);
    if (dragIndex >= 0) {
      dragTo(layout, dragIndex, dragX, dragY);
    }
    markSettled(isSettled(layout) && dragId === null);
    const peers: PeerCursor[] = peersFrame.map((peer) => ({
      clientId: peer.clientId,
      color: peer.color,
      x: peer.x,
      y: peer.y,
      nodeIndex: peer.draggingNodeId === null ? -1 : (layout.indexOf.get(peer.draggingNodeId) ?? -1)
    }));
    return {
      layout,
      labels,
      viewport: viewportFrame,
      selectedIndex: selectedIdFrame === null ? -1 : (layout.indexOf.get(selectedIdFrame) ?? -1),
      peers
    };
  };

  // ---- 4. imperative → reactive: pointer events become actions -------------

  const worldAt = (event: PointerEvent | WheelEvent): { x: number; y: number } => {
    const box = container.getBoundingClientRect();
    return screenToWorld(viewportFrame, event.clientX - box.left, event.clientY - box.top);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    container.setPointerCapture(event.pointerId);
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    const world = worldAt(event);
    const hit = state.selectAt(world.x, world.y);
    if (hit === null) {
      panning = true;
      return;
    }
    dragId = hit;
    dragX = world.x;
    dragY = world.y;
    state.publishPointer(world.x, world.y, hit);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const world = worldAt(event);
    if (panning) {
      state.panBy(event.clientX - lastPointerX, event.clientY - lastPointerY);
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
    } else if (dragId !== null) {
      dragX = world.x;
      dragY = world.y;
      reheat(layout, 0.25); // neighbours keep reacting while the node moves
    }
    // Every move rides presence — coalesced, no rows, no history, no undo.
    state.publishPointer(world.x, world.y, dragId);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
    if (dragId !== null) {
      const world = worldAt(event);
      // ONE gesture, ONE mutation, ONE undo step. Everything in between was
      // presence and never touched the database.
      state.pin(dragId, world.x, world.y);
      dragId = null;
    }
    panning = false;
    state.publishPointer(null, null, null);
  };

  const onWheelEvent = (event: WheelEvent): void => {
    event.preventDefault();
    const box = container.getBoundingClientRect();
    state.zoomAt(
      event.clientX - box.left,
      event.clientY - box.top,
      event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    );
  };

  // ---- lifecycle ----------------------------------------------------------

  // imperative boundary: mount the WebGL renderer and the raw pointer surface
  // once the element exists, and register the layout probe the service
  // hit-tests through. Everything created here is torn down in onCleanup.
  onMount(() => {
    // One AbortController for every listener this component owns.
    const listeners = new AbortController();
    const signal = listeners.signal;
    container.addEventListener('pointerdown', onPointerDown, { signal });
    container.addEventListener('pointermove', onPointerMove, { signal });
    container.addEventListener('pointerup', onPointerUp, { signal });
    container.addEventListener('pointercancel', onPointerUp, { signal });
    // Non-passive on purpose: zooming must stop the page from scrolling.
    container.addEventListener('wheel', onWheelEvent, { signal, passive: false });

    handle = createGraphCanvas(container, {
      frame,
      palette: readPalette(container),
      onResize: (width, height) => state.setSize(width, height)
    });

    // The service hit-tests through these plain readers — that is how
    // `selectAt(x, y)` works for both the pointer handler and Playwright
    // without a Float32Array ever entering reactive state.
    const probe: LayoutProbe = {
      pick: (worldX, worldY) => {
        const index = nodeAt(layout.x, layout.y, layout.count, worldX, worldY, PICK_RADIUS);
        return index < 0 ? null : (layout.ids[index] ?? null);
      },
      positionOf: (nodeId) => {
        const index = layout.indexOf.get(nodeId);
        return index === undefined ? null : { x: layout.x[index]!, y: layout.y[index]! };
      }
    };
    const unregister = state.registerProbe(probe);

    onCleanup(() => {
      listeners.abort();
      unregister();
      handle?.dispose();
      handle = null;
      state.publishPointer(null, null, null);
    });
  });

  return (
    <div use:componentRoot class={styles.stageWrap}>
      <Show when={state.status.kind === 'loading' && state.nodes.length === 0}>
        <span class="stale-note">loading… (first boot with no cache and no server waits here)</span>
      </Show>
      <div
        ref={container}
        class={styles.stage}
        data-testid="graph-stage"
        data-settled={state.settled ? 'true' : 'false'}
      />
      <p class={styles.hint}>
        Drag a node to pin it (one mutation on release), drag the background to pan, scroll to
        zoom. Positions are never synced — only pins are.
      </p>
    </div>
  );
}
