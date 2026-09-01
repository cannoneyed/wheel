/**
 * The camera: pan, zoom, and the canvas's pixel size. Purely local UI state —
 * never synced, because two people looking at the same graph from different
 * angles is a feature, not a conflict.
 *
 * It lives in a service rather than in the component so the debug panel can
 * show the camera beside the graph, and so the browser test can reason about
 * world coordinates. The math itself is in `canvas/picking.ts`, pure and
 * unit-tested; this service only holds the state and applies it.
 */
import { Service } from 'wheel/core';

import { clampZoom, zoomAbout, type Viewport } from '../canvas/picking';

/** The camera's starting frame: origin-centred, 1 screen pixel per world unit. */
const INITIAL: Viewport = { panX: 0, panY: 0, zoom: 1, width: 800, height: 480 };

/** Owns the graph camera. One atom, because pan and zoom always move together. */
export class ViewportService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'ViewportService';

  private readonly frame = this.atom<Viewport>(INITIAL, 'viewport');

  /** The current camera, in the exact shape picking.ts and the renderer read. */
  readonly viewport = this.computed((): Viewport => this.frame.get(), 'viewport');

  /** The canvas element's pixel size (the renderer's ResizeObserver reports it). */
  readonly setSize = this.action((width: number, height: number) => {
    const current = this.frame.get();
    if (current.width === width && current.height === height) {
      return;
    }
    this.frame.set({ ...current, width, height });
  }, 'setSize');

  /** Drag the background: move the camera by a screen-pixel delta. */
  readonly panBy = this.action((screenDx: number, screenDy: number) => {
    const current = this.frame.get();
    this.frame.set({
      ...current,
      panX: current.panX - screenDx / current.zoom,
      panY: current.panY + screenDy / current.zoom
    });
  }, 'panBy');

  /** Wheel-zoom about a screen point: the world under the pointer stays put. */
  readonly zoomAt = this.action((screenX: number, screenY: number, factor: number) => {
    const current = this.frame.get();
    const next = zoomAbout(current, screenX, screenY, clampZoom(current.zoom * factor));
    this.frame.set({ ...current, ...next });
  }, 'zoomAt');

  /** Back to the starting frame, keeping the measured size. */
  readonly reset = this.action(() => {
    const current = this.frame.get();
    this.frame.set({ ...INITIAL, width: current.width, height: current.height });
  }, 'reset');
}
