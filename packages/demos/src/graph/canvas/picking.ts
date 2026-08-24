/**
 * Screen ↔ world math and hit testing — PURE, and deliberately free of any
 * three.js import.
 *
 * A canvas has no DOM to query, so "which node did I just click?" would
 * normally be untestable without a GPU. Keeping the math here means
 * picking.test.ts proves it headlessly, and the renderer's camera is set up
 * from the SAME `Viewport` these functions read, so the two can't drift.
 *
 * Coordinate conventions, once, so nothing has to re-derive them:
 *   - World y points UP (three.js convention). Screen y points DOWN.
 *   - `panX`/`panY` is the world point at the CENTER of the viewport.
 *   - `zoom` is screen pixels per world unit.
 */

/** The camera state, in the exact form both the renderer and picking read. */
export interface Viewport {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
}

/** Zoom is clamped so a scroll gesture can never lose the graph entirely. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** Clamp a zoom level into the usable range. */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Canvas-relative pixel coordinates → world coordinates. */
export function screenToWorld(viewport: Viewport, screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: viewport.panX + (screenX - viewport.width / 2) / viewport.zoom,
    y: viewport.panY - (screenY - viewport.height / 2) / viewport.zoom
  };
}

/** World coordinates → canvas-relative pixel coordinates (the label overlay's job). */
export function worldToScreen(viewport: Viewport, worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: (worldX - viewport.panX) * viewport.zoom + viewport.width / 2,
    y: (viewport.panY - worldY) * viewport.zoom + viewport.height / 2
  };
}

/**
 * The index of the node nearest to a world point within `radius`, or -1.
 * Nearest wins rather than first-found, so overlapping nodes pick the one the
 * pointer is actually on top of.
 */
export function nodeAt(
  x: Float32Array,
  y: Float32Array,
  count: number,
  worldX: number,
  worldY: number,
  radius: number
): number {
  let best = -1;
  let bestDistanceSquared = radius * radius;
  for (let index = 0; index < count; index += 1) {
    const dx = x[index]! - worldX;
    const dy = y[index]! - worldY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared <= bestDistanceSquared) {
      best = index;
      bestDistanceSquared = distanceSquared;
    }
  }
  return best;
}

/**
 * Zoom about a fixed screen point (the pointer), the gesture every map does:
 * the world point under the cursor must not move while the scale changes.
 * Returns the new pan; the caller clamps nothing else.
 */
export function zoomAbout(
  viewport: Viewport,
  screenX: number,
  screenY: number,
  nextZoom: number
): { panX: number; panY: number; zoom: number } {
  const zoom = clampZoom(nextZoom);
  const anchor = screenToWorld(viewport, screenX, screenY);
  return {
    zoom,
    panX: anchor.x - (screenX - viewport.width / 2) / zoom,
    panY: anchor.y + (screenY - viewport.height / 2) / zoom
  };
}
