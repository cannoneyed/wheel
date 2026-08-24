/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { ownerWindow } from '../../base-utils/owner';

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Solid port of upstream's `getDisplacement` (from `utils/useSwipeDismiss.ts`).
 * No Solid or shared-utils precedent exists for swipe/drag math in this repo, so this is a
 * toast-local port of the two small pure functions `Toast.Root` needs — not shared infra.
 */
export function getDisplacement(direction: SwipeDirection, deltaX: number, deltaY: number) {
  switch (direction) {
    case 'up':
      return -deltaY;
    case 'down':
      return deltaY;
    case 'left':
      return -deltaX;
    case 'right':
      return deltaX;
    default:
      return 0;
  }
}

/**
 * Solid port of upstream's `getElementTransform`.
 */
export function getElementTransform(element: HTMLElement) {
  const computedStyle = ownerWindow(element).getComputedStyle(element);
  const transform = computedStyle.transform;
  let translateX = 0;
  let translateY = 0;
  let scale = 1;

  if (transform && transform !== 'none') {
    const matrix = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (matrix) {
      const values = matrix[1].split(', ').map(parseFloat);
      if (values.length === 6) {
        translateX = values[4];
        translateY = values[5];
        scale = Math.sqrt(values[0] * values[0] + values[1] * values[1]);
      } else if (values.length === 16) {
        translateX = values[12];
        translateY = values[13];
        scale = values[0];
      }
    }
  }

  return { x: translateX, y: translateY, scale };
}
