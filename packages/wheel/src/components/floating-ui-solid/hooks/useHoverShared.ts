/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { Placement } from '@floating-ui/dom';
import { isMouseLikePointerType } from '../utils/event';
import type { Delay, ExtendedElements, FloatingContext, FloatingTreeType } from '../types';

export { isTargetInsideEnabledTrigger as isInsideEnabledTrigger } from '../utils/element';

export interface HandleCloseOptions {
  blockPointerEvents?: boolean | undefined;
  getScope?: (() => HTMLElement | SVGSVGElement | null) | undefined;
}

export interface HandleCloseContext {
  x: number | null;
  y: number | null;
  placement: Placement | null;
  elements: Pick<ExtendedElements, 'domReference' | 'floating'>;
  onClose: () => void;
  nodeId?: string | undefined;
  tree?: FloatingTreeType | null | undefined;
  leave?: boolean | undefined;
}

export type HandleCloseContextBase = Omit<HandleCloseContext, 'onClose' | 'tree' | 'x' | 'y'>;

export interface HandleClose {
  (context: HandleCloseContext): (event: MouseEvent) => void;
  __options?: HandleCloseOptions | undefined;
}

/**
 * Solid port of upstream's `resolveValue`.
 *
 * Deviation: upstream's `value` may itself be a plain value *or* a callback
 * (`Delay | (() => Delay)`); per the locked hook-return convention, this port
 * always receives an already-resolved `Delay` (the caller invoked its
 * `Accessor<Delay>` first), so the callback branch is dropped.
 */
function resolveValue(
  value: Delay | undefined,
  pointerType?: PointerEvent['pointerType'],
): Delay | 0 | undefined {
  if (pointerType != null && !isMouseLikePointerType(pointerType)) {
    return 0;
  }

  return value;
}

export function getDelay(
  value: Delay | undefined,
  prop: 'open' | 'close',
  pointerType?: PointerEvent['pointerType'],
) {
  const result = resolveValue(value, pointerType);
  if (typeof result === 'number') {
    return result;
  }

  return result?.[prop];
}

/**
 * Deviation: identity function. Upstream resolves `number | (() => number)`;
 * this port's callers already hold the resolved `number` (read from an
 * `Accessor<number>`). Kept for call-site parity with upstream.
 */
export function getRestMs(value: number) {
  return value;
}

export function isClickLikeOpenEvent(openEventType: string | undefined, interactedInside: boolean) {
  return interactedInside || openEventType === 'click' || openEventType === 'mousedown';
}

export function isHoverOpenEvent(openEventType: string | undefined) {
  return openEventType?.includes('mouse') && openEventType !== 'mousedown';
}

/**
 * Solid-only adapter: upstream never needs this because upstream's
 * `FloatingContext.placement` is a plain resolved `Placement` (React holds
 * plain per-render values). This port's `FloatingContext.placement` is an
 * `Accessor<Placement>` instead (locked design decision — see `types.ts`),
 * so a `FloatingContext` can't be spread directly into a `HandleCloseContext`
 * (whose `placement` must already be a resolved value). This narrows either
 * a full `FloatingContext` or an already-resolved `HandleCloseContextBase`
 * down to the latter, resolving `placement` if it's still an accessor.
 */
export function resolveHandleCloseContextBase(
  base: FloatingContext | HandleCloseContextBase,
): HandleCloseContextBase {
  const placement =
    typeof base.placement === 'function'
      ? (base.placement as () => Placement)()
      : (base.placement as Placement | null);

  return {
    elements: base.elements,
    placement,
    nodeId: base.nodeId,
    leave: (base as Partial<HandleCloseContextBase>).leave,
  };
}
