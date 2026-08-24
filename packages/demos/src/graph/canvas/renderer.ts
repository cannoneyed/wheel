/**
 * The three.js adapter: everything that knows what WebGL is lives here, and
 * nothing here knows what wheel is.
 *
 * SHAPE. `createGraphCanvas(element, options) → { dispose() }` is the
 * element-taking factory the docs bless for imperative attachment
 * (content/docs/patterns.mdx) — the same shape as `createGesture`. It is not a ref
 * prop and not a component; the caller holds the returned handle in a plain
 * `let` and calls `dispose()` in `onCleanup`.
 *
 * THE LOOP READS, NEVER TRACKS. This is the discipline the demo exists to
 * show. `options.frame()` is called exactly once per animation frame and is
 * the loop's ONLY input. It must be a plain function reading plain fields —
 * if it read a signal, Solid would subscribe the effect that created this
 * renderer to every atom the graph touches, and each mutation would tear the
 * loop down and rebuild it 60 times a second. The component satisfies that by
 * projecting reactive state into plain `let` fields inside named
 * `createEffect`s, and having `frame()` read only those fields.
 *
 * WHAT IT DRAWS. Flat circles for nodes (one InstancedMesh, colored by
 * group), thin lines for edges, a ring around the selected node, a second
 * ring set on pinned nodes, and small rings for peer cursors. Labels are a
 * DOM overlay rather than sprites: 40 absolutely-positioned spans updated by
 * transform are simpler, sharper at every zoom, and give the browser test a
 * real element whose box it can read.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  RingGeometry,
  Scene,
  WebGLRenderer
} from 'three';

import { worldToScreen, type Viewport } from './picking';
import type { Layout } from './simulation';

/** One peer's live pointer, in world coordinates, plus the node they're dragging. */
export interface PeerCursor {
  readonly clientId: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  /** Index into the layout of the node this peer is dragging, or -1. */
  readonly nodeIndex: number;
}

/** Everything one animation frame needs, assembled by the caller from plain fields. */
export interface GraphFrame {
  readonly layout: Layout;
  readonly labels: readonly string[];
  readonly viewport: Viewport;
  readonly selectedIndex: number;
  readonly peers: readonly PeerCursor[];
}

/** The colors the renderer paints with, read off the DOM as CSS token values. */
export interface GraphPalette {
  readonly background: string;
  readonly edge: string;
  readonly accent: string;
  /** One color per group index, in the order the caller assigns group numbers. */
  readonly groups: readonly string[];
}

/** Construction options for the canvas. */
export interface GraphCanvasOptions {
  /** The loop's single input; see "THE LOOP READS, NEVER TRACKS" above. */
  readonly frame: () => GraphFrame;
  readonly palette: GraphPalette;
  /** Called when the element resizes, so the caller can update its viewport. */
  readonly onResize: (width: number, height: number) => void;
}

/** The imperative handle the component keeps in a plain `let`. */
export interface GraphCanvasHandle {
  dispose(): void;
}

/** World-unit radius of a node disc — picking.ts hit-tests against the same value. */
export const NODE_RADIUS = 7;

/** How many peer cursors are drawn at once (the demo never has more open windows). */
const MAX_PEERS = 6;

/** Instance capacity grows in steps so an add doesn't reallocate every time. */
const capacityFor = (count: number): number => Math.max(64, 1 << Math.ceil(Math.log2(count + 1)));

export function createGraphCanvas(element: HTMLElement, options: GraphCanvasOptions): GraphCanvasHandle {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  element.append(canvas);

  const overlay = document.createElement('div');
  overlay.dataset.graphLabels = '';
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.pointerEvents = 'none';
  overlay.style.overflow = 'hidden';
  element.append(overlay);

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.setClearColor(new Color(options.palette.background), 1);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const groupColors = options.palette.groups.map((value) => new Color(value));
  const edgeMaterial = new LineBasicMaterial({ color: new Color(options.palette.edge) });
  const nodeGeometry = new CircleGeometry(1, 24);
  const nodeMaterial = new MeshBasicMaterial();
  const pinGeometry = new RingGeometry(1.3, 1.55, 24);
  const pinMaterial = new MeshBasicMaterial({ color: new Color(options.palette.accent) });

  const edgeGeometry = new BufferGeometry();
  // The position attribute exists from the start: three.js has no attribute to
  // flag on the first frame otherwise, and an empty graph would crash the loop.
  let edgePositions = new Float32Array(768);
  edgeGeometry.setAttribute('position', new BufferAttribute(edgePositions, 3));
  edgeGeometry.setDrawRange(0, 0);
  const edgeLines = new LineSegments(edgeGeometry, edgeMaterial);
  edgeLines.frustumCulled = false;
  scene.add(edgeLines);

  let nodeMesh: InstancedMesh | null = null;
  let pinMesh: InstancedMesh | null = null;
  let capacity = 0;

  const selectionRing = new Mesh(
    new RingGeometry(NODE_RADIUS * 1.45, NODE_RADIUS * 1.8, 32),
    new MeshBasicMaterial({ color: new Color(options.palette.accent) })
  );
  selectionRing.visible = false;
  selectionRing.position.z = 2;
  scene.add(selectionRing);

  const peerGeometry = new RingGeometry(3.2, 5, 20);
  const peerNodeGeometry = new RingGeometry(NODE_RADIUS * 1.1, NODE_RADIUS * 1.35, 24);
  const peerCursors = Array.from({ length: MAX_PEERS }, () => {
    const dot = new Mesh(peerGeometry, new MeshBasicMaterial());
    const ring = new Mesh(peerNodeGeometry, new MeshBasicMaterial());
    dot.visible = false;
    ring.visible = false;
    dot.position.z = 3;
    ring.position.z = 3;
    scene.add(dot, ring);
    return { dot, ring };
  });

  /** Scratch transform — one object reused for every instance write. */
  const scratch = new Object3D();
  const scratchColor = new Color();

  function ensureCapacity(count: number): void {
    const needed = capacityFor(count);
    if (nodeMesh && needed <= capacity) {
      return;
    }
    if (nodeMesh) {
      scene.remove(nodeMesh, pinMesh!);
      nodeMesh.dispose();
      pinMesh!.dispose();
    }
    capacity = needed;
    nodeMesh = new InstancedMesh(nodeGeometry, nodeMaterial, capacity);
    nodeMesh.frustumCulled = false;
    pinMesh = new InstancedMesh(pinGeometry, pinMaterial, capacity);
    pinMesh.frustumCulled = false;
    pinMesh.position.z = 1;
    scene.add(nodeMesh, pinMesh);
  }

  /** Label spans, grown on demand and reused; `lastText` avoids DOM churn. */
  const labelSpans: HTMLSpanElement[] = [];
  const lastText: string[] = [];

  function drawLabels(frame: GraphFrame): void {
    const { layout, viewport, labels } = frame;
    const visible = viewport.zoom >= 0.45;
    while (labelSpans.length < layout.count) {
      const span = document.createElement('span');
      span.style.position = 'absolute';
      span.style.left = '0';
      span.style.top = '0';
      span.style.whiteSpace = 'nowrap';
      span.style.transformOrigin = '0 0';
      overlay.append(span);
      labelSpans.push(span);
      lastText.push('');
    }
    for (let index = 0; index < labelSpans.length; index += 1) {
      const span = labelSpans[index]!;
      if (index >= layout.count || !visible) {
        span.style.display = 'none';
        continue;
      }
      const text = labels[index] ?? '';
      if (lastText[index] !== text) {
        span.textContent = text;
        span.dataset.graphLabel = text;
        lastText[index] = text;
      }
      const point = worldToScreen(viewport, layout.x[index]!, layout.y[index]!);
      span.style.display = 'block';
      span.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(
        point.y + NODE_RADIUS * viewport.zoom + 3
      )}px) translateX(-50%)`;
    }
  }

  function draw(frame: GraphFrame): void {
    const { layout, viewport, selectedIndex, peers } = frame;

    camera.left = -viewport.width / 2;
    camera.right = viewport.width / 2;
    camera.top = viewport.height / 2;
    camera.bottom = -viewport.height / 2;
    camera.zoom = viewport.zoom;
    camera.position.set(viewport.panX, viewport.panY, 10);
    camera.updateProjectionMatrix();

    // Edges first (they render under the discs).
    const vertexCount = layout.edgeIndices.length; // two endpoints per edge pair
    if (edgePositions.length < vertexCount * 3) {
      edgePositions = new Float32Array(vertexCount * 6); // room to grow
      edgeGeometry.setAttribute('position', new BufferAttribute(edgePositions, 3));
    }
    for (let e = 0; e < layout.edgeIndices.length; e += 1) {
      const node = layout.edgeIndices[e]!;
      edgePositions[e * 3] = layout.x[node]!;
      edgePositions[e * 3 + 1] = layout.y[node]!;
      edgePositions[e * 3 + 2] = 0;
    }
    edgeGeometry.getAttribute('position').needsUpdate = true;
    edgeGeometry.setDrawRange(0, vertexCount);

    ensureCapacity(layout.count);
    const nodes = nodeMesh!;
    const pins = pinMesh!;
    let pinCount = 0;
    for (let index = 0; index < layout.count; index += 1) {
      scratch.position.set(layout.x[index]!, layout.y[index]!, 0);
      scratch.scale.setScalar(NODE_RADIUS);
      scratch.updateMatrix();
      nodes.setMatrixAt(index, scratch.matrix);
      const color = groupColors[layout.group[index]!] ?? groupColors[0]!;
      nodes.setColorAt(index, scratchColor.copy(color));
      if (layout.pinned[index] === 1) {
        scratch.scale.setScalar(NODE_RADIUS);
        scratch.updateMatrix();
        pins.setMatrixAt(pinCount, scratch.matrix);
        pinCount += 1;
      }
    }
    nodes.count = layout.count;
    nodes.instanceMatrix.needsUpdate = true;
    if (nodes.instanceColor) {
      nodes.instanceColor.needsUpdate = true;
    }
    pins.count = pinCount;
    pins.instanceMatrix.needsUpdate = true;

    if (selectedIndex >= 0 && selectedIndex < layout.count) {
      selectionRing.visible = true;
      selectionRing.position.set(layout.x[selectedIndex]!, layout.y[selectedIndex]!, 2);
    } else {
      selectionRing.visible = false;
    }

    for (let index = 0; index < peerCursors.length; index += 1) {
      const slot = peerCursors[index]!;
      const peer = peers[index];
      if (!peer) {
        slot.dot.visible = false;
        slot.ring.visible = false;
        continue;
      }
      (slot.dot.material as MeshBasicMaterial).color.set(peer.color);
      (slot.ring.material as MeshBasicMaterial).color.set(peer.color);
      slot.dot.visible = true;
      slot.dot.position.set(peer.x, peer.y, 3);
      const dragged = peer.nodeIndex;
      if (dragged >= 0 && dragged < layout.count) {
        slot.ring.visible = true;
        slot.ring.position.set(layout.x[dragged]!, layout.y[dragged]!, 3);
      } else {
        slot.ring.visible = false;
      }
    }

    renderer.render(scene, camera);
    drawLabels(frame);
  }

  let rafId = 0;
  const tick = (): void => {
    rafId = requestAnimationFrame(tick);
    draw(options.frame());
  };
  rafId = requestAnimationFrame(tick);

  const observer = new ResizeObserver(() => {
    const width = Math.max(element.clientWidth, 1);
    const height = Math.max(element.clientHeight, 1);
    renderer.setSize(width, height, false);
    options.onResize(width, height);
  });
  observer.observe(element);

  return {
    dispose(): void {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      nodeMesh?.dispose();
      pinMesh?.dispose();
      selectionRing.geometry.dispose();
      (selectionRing.material as MeshBasicMaterial).dispose();
      for (const slot of peerCursors) {
        (slot.dot.material as MeshBasicMaterial).dispose();
        (slot.ring.material as MeshBasicMaterial).dispose();
      }
      peerGeometry.dispose();
      peerNodeGeometry.dispose();
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      pinGeometry.dispose();
      pinMaterial.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      renderer.dispose();
      canvas.remove();
      overlay.remove();
    }
  };
}
