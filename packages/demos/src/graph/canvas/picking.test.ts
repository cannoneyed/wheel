// @vitest-environment node
/**
 * Hit testing and camera math, headless. A canvas can't be queried, so if
 * this file is wrong the only symptom is "clicking a node sometimes selects
 * the wrong one" — reported by a human, weeks later. These are the assertions
 * that catch it at edit time instead.
 */
import { describe, expect, test } from 'vitest';

import { MAX_ZOOM, MIN_ZOOM, clampZoom, nodeAt, screenToWorld, worldToScreen, zoomAbout, type Viewport } from './picking';

const viewport = (overrides: Partial<Viewport> = {}): Viewport => ({
  panX: 0,
  panY: 0,
  zoom: 1,
  width: 800,
  height: 400,
  ...overrides
});

describe('screen ↔ world', () => {
  test('the viewport centre is the pan point', () => {
    expect(screenToWorld(viewport({ panX: 30, panY: -10 }), 400, 200)).toEqual({ x: 30, y: -10 });
  });

  test('screen y points DOWN, world y points UP', () => {
    const world = screenToWorld(viewport(), 400, 150); // 50px above centre
    expect(world.y).toBeCloseTo(50, 6);
    expect(world.x).toBeCloseTo(0, 6);
  });

  test('zoom is screen pixels per world unit', () => {
    const world = screenToWorld(viewport({ zoom: 2 }), 500, 200);
    expect(world.x).toBeCloseTo(50, 6); // 100px right ÷ 2
  });

  test('round-trips through worldToScreen at any pan and zoom', () => {
    const frame = viewport({ panX: -42.5, panY: 17.25, zoom: 1.7 });
    for (const point of [
      { x: 0, y: 0 },
      { x: 120, y: -85 },
      { x: -300, y: 240 }
    ]) {
      const screen = worldToScreen(frame, point.x, point.y);
      const back = screenToWorld(frame, screen.x, screen.y);
      expect(back.x).toBeCloseTo(point.x, 4);
      expect(back.y).toBeCloseTo(point.y, 4);
    }
  });
});

describe('nodeAt', () => {
  const x = Float32Array.from([0, 30, 31, -100]);
  const y = Float32Array.from([0, 0, 2, 100]);

  test('returns the index of a node under the point', () => {
    expect(nodeAt(x, y, 4, 1, 1, 10)).toBe(0);
    expect(nodeAt(x, y, 4, -98, 101, 10)).toBe(3);
  });

  test('returns -1 when nothing is within the radius', () => {
    expect(nodeAt(x, y, 4, 500, 500, 10)).toBe(-1);
    expect(nodeAt(x, y, 4, 15, 0, 10)).toBe(-1); // exactly between two nodes
  });

  test('overlapping nodes resolve to the NEAREST, not the first found', () => {
    // (30,0) and (31,2) both fall inside a radius of 12 around (31.4, 2.2).
    expect(nodeAt(x, y, 4, 31.4, 2.2, 12)).toBe(2);
    expect(nodeAt(x, y, 4, 29.6, -0.2, 12)).toBe(1);
  });

  test('respects the count, ignoring stale slots past it', () => {
    expect(nodeAt(x, y, 1, 30, 0, 10)).toBe(-1);
  });
});

describe('zoom', () => {
  test('clamps into the usable range', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  test('zoomAbout keeps the world point under the cursor fixed', () => {
    const frame = viewport({ panX: 12, panY: -3, zoom: 1 });
    const anchorBefore = screenToWorld(frame, 620, 90);
    const next = zoomAbout(frame, 620, 90, 2.5);
    const anchorAfter = screenToWorld({ ...frame, ...next }, 620, 90);
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x, 5);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y, 5);
    expect(next.zoom).toBe(2.5);
  });

  test('zoomAbout clamps too, so a fast scroll cannot lose the graph', () => {
    expect(zoomAbout(viewport(), 400, 200, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAbout(viewport(), 400, 200, 0).zoom).toBe(MIN_ZOOM);
  });
});
