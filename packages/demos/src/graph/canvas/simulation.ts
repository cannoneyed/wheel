/**
 * The force-directed layout — PURE, headless, and the reason this demo has
 * anything to say about the freeze doctrine.
 *
 * Positions and velocities live in `Float32Array`s. `Atom.set` runs
 * `freezeDeep` on every write, always, so a typed array put in an atom is
 * frozen and the next `x[i] = …` silently does nothing (or throws in strict
 * mode). These buffers therefore NEVER enter reactive state: the component
 * holds the `Layout` in a plain `let`, the rAF loop mutates it, and the only
 * things that reach atoms are small facts ABOUT it (settled yes/no, which
 * node is selected).
 *
 * Nothing here imports three.js, Solid, or wheel — it is arithmetic over
 * arrays, so simulation.test.ts runs it in node with no DOM at all.
 *
 * The model, in one paragraph: every pair of nodes pushes apart with an
 * inverse-square repulsion, every edge pulls its endpoints toward a rest
 * length like a spring, everything drifts gently toward the origin so the
 * graph can't wander off screen, and velocities are damped each step. A
 * cooling factor `alpha` scales all of it; when alpha reaches zero the layout
 * is SETTLED and steps become no-ops. Adding a node reheats it.
 */

/** A node as the simulation needs it: an id, a color group, and an optional pin. */
export interface LayoutNode {
  readonly id: string;
  readonly group: number;
  readonly pinX: number | null;
  readonly pinY: number | null;
}

/** An edge as the simulation needs it: two node ids. */
export interface LayoutEdge {
  readonly from: string;
  readonly to: string;
}

/**
 * The mutable layout state. Everything except `alpha` is a fixed-length typed
 * array sized to the node count; `edgeIndices` holds flat index pairs
 * (`[a0, b0, a1, b1, …]`) so the spring loop never touches a string.
 */
export interface Layout {
  readonly ids: readonly string[];
  readonly indexOf: ReadonlyMap<string, number>;
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly group: Uint8Array;
  /** 1 where the node has a user-dropped pin the simulation must respect. */
  readonly pinned: Uint8Array;
  readonly pinX: Float32Array;
  readonly pinY: Float32Array;
  readonly edgeIndices: Int32Array;
  /** Cooling factor in [0, 1]. Zero means settled: `stepLayout` returns early. */
  alpha: number;
}

/** Tunables, all in world units. The defaults produce a readable 40-node graph. */
export interface StepOptions {
  readonly repulsion: number;
  readonly springLength: number;
  readonly springStrength: number;
  readonly gravity: number;
  readonly damping: number;
  readonly alphaDecay: number;
  readonly alphaMin: number;
}

/** Defaults tuned against the seeded 40-node / ~54-edge dataset. */
export const DEFAULT_STEP_OPTIONS: StepOptions = {
  repulsion: 5200,
  springLength: 46,
  springStrength: 0.055,
  gravity: 0.014,
  damping: 0.86,
  alphaDecay: 0.014,
  alphaMin: 0.006
};

/** The one seed this demo uses, so every client lays the same graph out the same way. */
export const LAYOUT_SEED = 0x5eed_10ad;

/**
 * mulberry32 — a tiny, fast, fully deterministic PRNG. `Math.random` is
 * lint-banned in `src/` (no seed can replay it), and a graph whose initial
 * placement differed per client would make "two windows agree" unprovable.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Initial ring placement for a node the layout has never seen. */
function place(random: () => number): { x: number; y: number } {
  const angle = random() * Math.PI * 2;
  const radius = 40 + random() * 200;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/**
 * Build the buffers for `nodes`/`edges`, carrying over the live position and
 * velocity of every node that survives from `previous`. That carry-over is
 * what makes an add or a delete look like an edit to a live graph instead of
 * a full re-layout: existing nodes keep their spot and drift to the new
 * equilibrium.
 *
 * Pure: the only mutable thing it touches is the caller's `random` stream.
 */
export function createLayout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  previous: Layout | null,
  random: () => number
): Layout {
  const count = nodes.length;
  const ids = nodes.map((node) => node.id);
  const indexOf = new Map<string, number>(ids.map((id, index) => [id, index]));
  const layout: Layout = {
    ids,
    indexOf,
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    vx: new Float32Array(count),
    vy: new Float32Array(count),
    group: new Uint8Array(count),
    pinned: new Uint8Array(count),
    pinX: new Float32Array(count),
    pinY: new Float32Array(count),
    edgeIndices: new Int32Array(0),
    alpha: 1
  };
  for (let index = 0; index < count; index += 1) {
    const node = nodes[index]!;
    const carried = previous?.indexOf.get(node.id);
    if (carried !== undefined) {
      layout.x[index] = previous!.x[carried]!;
      layout.y[index] = previous!.y[carried]!;
      layout.vx[index] = previous!.vx[carried]!;
      layout.vy[index] = previous!.vy[carried]!;
    } else {
      const spot = place(random);
      layout.x[index] = spot.x;
      layout.y[index] = spot.y;
    }
    layout.group[index] = node.group;
    if (node.pinX !== null && node.pinY !== null) {
      layout.pinned[index] = 1;
      layout.pinX[index] = node.pinX;
      layout.pinY[index] = node.pinY;
      layout.x[index] = node.pinX;
      layout.y[index] = node.pinY;
    }
  }
  // Edges whose endpoints are both present; a half-deleted edge can exist for
  // one render between two optimistic applies and must not index out of range.
  const pairs: number[] = [];
  for (const edge of edges) {
    const from = indexOf.get(edge.from);
    const to = indexOf.get(edge.to);
    if (from !== undefined && to !== undefined && from !== to) {
      pairs.push(from, to);
    }
  }
  return { ...layout, edgeIndices: Int32Array.from(pairs) };
}

/**
 * Advance one fixed timestep. Fixed, not wall-clock-scaled, on purpose: a
 * dt-scaled integrator makes the settled layout depend on the machine's frame
 * rate, and "two windows show the same graph" would stop being true the
 * moment one of them dropped frames.
 */
export function stepLayout(layout: Layout, options: StepOptions = DEFAULT_STEP_OPTIONS): void {
  if (layout.alpha === 0 || layout.count === 0) {
    return;
  }
  const { x, y, vx, vy, count, pinned, pinX, pinY, edgeIndices } = layout;
  const alpha = layout.alpha;

  // Repulsion: every pair pushes apart. O(n²) is 780 pairs at 40 nodes —
  // cheaper than the quadtree that would replace it, and exactly readable.
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      let dx = x[i]! - x[j]!;
      let dy = y[i]! - y[j]!;
      let distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < 0.01) {
        // Exactly coincident nodes have no direction to separate along; nudge
        // them apart deterministically by index instead of randomly.
        dx = (i - j) * 0.01;
        dy = 0.01;
        distanceSquared = dx * dx + dy * dy;
      }
      const distance = Math.sqrt(distanceSquared);
      const force = (options.repulsion / distanceSquared) * alpha;
      const ux = (dx / distance) * force;
      const uy = (dy / distance) * force;
      vx[i] = vx[i]! + ux;
      vy[i] = vy[i]! + uy;
      vx[j] = vx[j]! - ux;
      vy[j] = vy[j]! - uy;
    }
  }

  // Springs: each edge pulls its endpoints toward the rest length.
  for (let e = 0; e < edgeIndices.length; e += 2) {
    const i = edgeIndices[e]!;
    const j = edgeIndices[e + 1]!;
    const dx = x[j]! - x[i]!;
    const dy = y[j]! - y[i]!;
    const distance = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const force = (distance - options.springLength) * options.springStrength * alpha;
    const ux = (dx / distance) * force;
    const uy = (dy / distance) * force;
    vx[i] = vx[i]! + ux;
    vy[i] = vy[i]! + uy;
    vx[j] = vx[j]! - ux;
    vy[j] = vy[j]! - uy;
  }

  // Gravity toward the origin, then damp and integrate. Pinned nodes ignore
  // all of it — the user placed them, the simulation obeys.
  for (let i = 0; i < count; i += 1) {
    if (pinned[i] === 1) {
      x[i] = pinX[i]!;
      y[i] = pinY[i]!;
      vx[i] = 0;
      vy[i] = 0;
      continue;
    }
    vx[i] = (vx[i]! - x[i]! * options.gravity * alpha) * options.damping;
    vy[i] = (vy[i]! - y[i]! * options.gravity * alpha) * options.damping;
    x[i] = x[i]! + vx[i]!;
    y[i] = y[i]! + vy[i]!;
  }

  const cooled = alpha - alpha * options.alphaDecay;
  layout.alpha = cooled < options.alphaMin ? 0 : cooled;
}

/** True once the layout has stopped moving (what the DOM mirrors as `data-settled`). */
export function isSettled(layout: Layout): boolean {
  return layout.alpha === 0;
}

/** Wake a settled layout up — an add, a delete, or a released pin all reheat it. */
export function reheat(layout: Layout, alpha = 0.7): void {
  layout.alpha = Math.max(layout.alpha, alpha);
}

/** Park a node at a live drag position without writing a pin row (drag preview). */
export function dragTo(layout: Layout, index: number, worldX: number, worldY: number): void {
  layout.x[index] = worldX;
  layout.y[index] = worldY;
  layout.vx[index] = 0;
  layout.vy[index] = 0;
}
