import { addEventListener } from '../../base-utils/addEventListener';
import { ownerWindow } from '../../base-utils/owner';

/**
 * Solid port of upstream's `number-field/utils/subscribeToVisualViewportResize.ts`. The
 * `React.RefObject` mutable-ref parameter becomes a plain `{ current }` object — Solid has no
 * ref-object type of its own, and a plain object serves the same mutable-cell purpose.
 *
 * This lets us invert the scale of the cursor to match the OS scale, in which the cursor doesn't
 * scale with the content on pinch-zoom.
 */
export function subscribeToVisualViewportResize(
  element: Element,
  visualScaleRef: { current: number },
) {
  const vV = ownerWindow(element).visualViewport;

  if (!vV) {
    return () => {};
  }

  function handleVisualResize() {
    if (vV) {
      visualScaleRef.current = vV.scale;
    }
  }

  handleVisualResize();
  return addEventListener(vV, 'resize', handleVisualResize);
}
