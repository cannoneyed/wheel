// @vitest-environment node
/**
 * The layout machinery WITHOUT a canvas, a GPU, or a DOM — which is the point
 * of keeping it pure. Four properties matter for the demo's honesty:
 *
 *   1. DETERMINISM. Same seed, same rows, same picture. This is what lets the
 *      demo claim "positions never sync" without the two windows drifting.
 *   2. SETTLING. The simulation cools to a stop instead of jittering forever
 *      (the DOM mirrors this as `data-settled`, which the browser test waits on).
 *   3. PINS WIN. A pinned node stays exactly where the user dropped it.
 *   4. CONTINUITY. Adding or deleting a node carries the survivors' positions
 *      over, so the graph edits instead of re-laying-out.
 */
import { describe, expect, test } from 'vitest';

import {
  DEFAULT_STEP_OPTIONS,
  LAYOUT_SEED,
  createLayout,
  createRandom,
  dragTo,
  isSettled,
  reheat,
  stepLayout,
  type LayoutEdge,
  type LayoutNode
} from './simulation';

const node = (id: string, overrides: Partial<LayoutNode> = {}): LayoutNode => ({
  id,
  group: 0,
  pinX: null,
  pinY: null,
  ...overrides
});

/** A small chain graph: a–b–c–d plus an isolated e. */
const NODES: LayoutNode[] = [node('a'), node('b'), node('c'), node('d'), node('e')];
const EDGES: LayoutEdge[] = [
  { from: 'a', to: 'b' },
  { from: 'b', to: 'c' },
  { from: 'c', to: 'd' }
];

/** Run a layout to rest (or the step cap) and report the final positions. */
function settle(nodes: LayoutNode[], edges: LayoutEdge[], seed = LAYOUT_SEED) {
  const layout = createLayout(nodes, edges, null, createRandom(seed));
  let steps = 0;
  while (!isSettled(layout) && steps < 5000) {
    stepLayout(layout);
    steps += 1;
  }
  return { layout, steps };
}

const distance = (
  buffers: { x: Float32Array; y: Float32Array; indexOf: ReadonlyMap<string, number> },
  from: string,
  to: string
): number => {
  const i = buffers.indexOf.get(from)!;
  const j = buffers.indexOf.get(to)!;
  return Math.hypot(buffers.x[i]! - buffers.x[j]!, buffers.y[i]! - buffers.y[j]!);
};

describe('createRandom', () => {
  test('the same seed replays the same stream', () => {
    const a = createRandom(1234);
    const b = createRandom(1234);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  test('different seeds diverge, and every draw is in [0, 1)', () => {
    const random = createRandom(LAYOUT_SEED);
    const draws = Array.from({ length: 200 }, () => random());
    expect(draws.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(createRandom(1)()).not.toBe(createRandom(2)());
  });
});

describe('createLayout', () => {
  test('places every node and indexes it by id', () => {
    const layout = createLayout(NODES, EDGES, null, createRandom(LAYOUT_SEED));
    expect(layout.count).toBe(5);
    expect([...layout.indexOf.keys()]).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(layout.edgeIndices.length).toBe(6); // three edges × two endpoints
    expect(layout.x.every((value) => Number.isFinite(value))).toBe(true);
  });

  test('drops edges whose endpoints are missing, and self-edges', () => {
    const layout = createLayout(
      [node('a'), node('b')],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'gone' },
        { from: 'a', to: 'a' }
      ],
      null,
      createRandom(1)
    );
    expect(layout.edgeIndices.length).toBe(2);
  });

  test('a pinned node starts AT its pin', () => {
    const layout = createLayout([node('a', { pinX: 33, pinY: -12 })], [], null, createRandom(1));
    expect(layout.pinned[0]).toBe(1);
    expect(layout.x[0]).toBeCloseTo(33, 3);
    expect(layout.y[0]).toBeCloseTo(-12, 3);
  });

  test('surviving nodes carry their position and velocity across a rebuild', () => {
    const { layout } = settle(NODES, EDGES);
    const before = { x: layout.x[layout.indexOf.get('c')!]!, y: layout.y[layout.indexOf.get('c')!]! };
    // Delete 'a' and add 'f': 'c' must not teleport.
    const rebuilt = createLayout(
      [node('b'), node('c'), node('d'), node('e'), node('f')],
      [{ from: 'b', to: 'c' }],
      layout,
      createRandom(7)
    );
    const index = rebuilt.indexOf.get('c')!;
    expect(rebuilt.x[index]).toBeCloseTo(before.x, 4);
    expect(rebuilt.y[index]).toBeCloseTo(before.y, 4);
    expect(rebuilt.count).toBe(5);
  });
});

describe('stepLayout', () => {
  test('is deterministic: the same seed settles to the same picture', () => {
    const first = settle(NODES, EDGES);
    const second = settle(NODES, EDGES);
    expect(second.steps).toBe(first.steps);
    expect([...second.layout.x]).toEqual([...first.layout.x]);
    expect([...second.layout.y]).toEqual([...first.layout.y]);
  });

  test('cools to a stop rather than jittering forever', () => {
    const { layout, steps } = settle(NODES, EDGES);
    expect(isSettled(layout)).toBe(true);
    expect(steps).toBeLessThan(5000);
    expect(layout.alpha).toBe(0);
    // A settled layout is inert: stepping it again changes nothing.
    const frozen = [...layout.x];
    stepLayout(layout);
    expect([...layout.x]).toEqual(frozen);
  });

  test('connected nodes end up closer than unconnected ones', () => {
    const { layout } = settle(NODES, EDGES);
    // 'e' is isolated, so repulsion alone pushes it away; a–b is a spring.
    expect(distance(layout, 'a', 'b')).toBeLessThan(distance(layout, 'a', 'e'));
    // Springs relax toward the rest length, not to zero.
    expect(distance(layout, 'b', 'c')).toBeGreaterThan(DEFAULT_STEP_OPTIONS.springLength * 0.4);
  });

  test('a pinned node never moves, however hard its neighbours pull', () => {
    const nodes = [node('a', { pinX: 120, pinY: -80 }), node('b'), node('c')];
    const { layout } = settle(nodes, [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' }
    ]);
    const index = layout.indexOf.get('a')!;
    expect(layout.x[index]).toBeCloseTo(120, 3);
    expect(layout.y[index]).toBeCloseTo(-80, 3);
    expect(layout.vx[index]).toBe(0);
  });

  test('coincident nodes separate instead of producing NaN', () => {
    const layout = createLayout([node('a'), node('b')], [], null, createRandom(1));
    layout.x[0] = 0;
    layout.y[0] = 0;
    layout.x[1] = 0;
    layout.y[1] = 0;
    stepLayout(layout);
    expect(Number.isFinite(layout.x[0])).toBe(true);
    expect(Number.isFinite(layout.x[1])).toBe(true);
    expect(layout.x[0]).not.toBe(layout.x[1]);
  });

  test('an empty layout is a safe no-op', () => {
    const layout = createLayout([], [], null, createRandom(1));
    expect(() => stepLayout(layout)).not.toThrow();
  });
});

describe('reheat and dragTo', () => {
  test('reheat wakes a settled layout back up', () => {
    const { layout } = settle(NODES, EDGES);
    expect(isSettled(layout)).toBe(true);
    reheat(layout);
    expect(isSettled(layout)).toBe(false);
    expect(layout.alpha).toBeCloseTo(0.7, 5);
  });

  test('reheat never cools a hot layout', () => {
    const layout = createLayout(NODES, EDGES, null, createRandom(1));
    layout.alpha = 0.9;
    reheat(layout, 0.3);
    expect(layout.alpha).toBe(0.9);
  });

  test('dragTo parks a node with zero velocity (the live-drag preview)', () => {
    const layout = createLayout(NODES, EDGES, null, createRandom(1));
    dragTo(layout, 2, 45, -60);
    expect(layout.x[2]).toBeCloseTo(45, 3);
    expect(layout.y[2]).toBeCloseTo(-60, 3);
    expect(layout.vx[2]).toBe(0);
    expect(layout.vy[2]).toBe(0);
  });
});
