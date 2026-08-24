/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { Derivable, Middleware, Padding } from '@floating-ui/dom';
import {
  clamp,
  evaluate,
  getAlignment,
  getAlignmentAxis,
  getAxisLength,
  getPaddingObject,
} from '@floating-ui/utils';

/**
 * A `{ current }` ref-like object or a zero-arg accessor resolving to the
 * arrow element. Solid has no ref-object convention for DOM nodes (a plain
 * `let` + ref callback is idiomatic — see CONVENTIONS.md #10), but the arrow
 * middleware's `fn` needs to read whatever the *current* element is at each
 * `computePosition` pass, so both shapes upstream's loose `any`-typed
 * `element` could carry are accepted explicitly here: a `{ current }` object
 * (for callers that keep a mutable ref) or an accessor closing over a
 * `let`-bound variable.
 */
export type ArrowElement =
  | Element
  | { current: Element | null | undefined }
  | (() => Element | null | undefined)
  | null
  | undefined;

function resolveArrowElement(element: ArrowElement): Element | null {
  if (element == null) {
    return null;
  }
  if (typeof element === 'function') {
    return element() ?? null;
  }
  if ('current' in element) {
    return element.current ?? null;
  }
  return element;
}

export interface ArrowOptions {
  /**
   * The arrow element to be positioned.
   * @default undefined
   */
  element: ArrowElement;
  /**
   * The padding between the arrow element and the floating element edges.
   * Useful when the floating element has rounded corners.
   * @default 0
   */
  padding?: Padding | undefined;
  /**
   * Which element to use as the offset parent.
   * @default 'real'
   */
  offsetParent?: 'real' | 'floating' | undefined;
}

/**
 * Fork of the original `arrow` middleware from Floating UI that allows
 * configuring the offset parent.
 *
 * Framework-neutral: ported verbatim from upstream aside from resolving
 * `options.element` through {@link resolveArrowElement} instead of reading a
 * React ref's `.current` directly.
 */
export const baseArrow = (options: ArrowOptions | Derivable<ArrowOptions>): Middleware => ({
  name: 'arrow',
  options,
  async fn(state) {
    const { x, y, placement, rects, platform, elements, middlewareData } = state;
    // Since `element` is required, we don't Partial<> the type.
    const resolvedOptions = (evaluate(options, state) || {}) as Partial<ArrowOptions>;
    const { padding = 0, offsetParent = 'real' } = resolvedOptions;
    const element = resolveArrowElement(resolvedOptions.element);

    if (element == null) {
      return {};
    }

    const paddingObject = getPaddingObject(padding);
    const coords = { x, y };
    const axis = getAlignmentAxis(placement);
    const length = getAxisLength(axis);
    const arrowDimensions = await platform.getDimensions(element);
    const isYAxis = axis === 'y';
    const minProp = isYAxis ? 'top' : 'left';
    const maxProp = isYAxis ? 'bottom' : 'right';
    const clientProp = isYAxis ? 'clientHeight' : 'clientWidth';

    const endDiff =
      rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
    const startDiff = coords[axis] - rects.reference[axis];

    const arrowOffsetParent =
      offsetParent === 'real' ? await platform.getOffsetParent?.(element) : elements.floating;
    let clientSize = elements.floating[clientProp] || rects.floating[length];

    // DOM platform can return `window` as the `offsetParent`.
    if (!clientSize || !(await platform.isElement?.(arrowOffsetParent))) {
      clientSize = elements.floating[clientProp] || rects.floating[length];
    }

    const centerToReference = endDiff / 2 - startDiff / 2;

    // If the padding is large enough that it causes the arrow to no longer be
    // centered, modify the padding so that it is centered.
    const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
    const minPadding = Math.min(paddingObject[minProp], largestPossiblePadding);
    const maxPadding = Math.min(paddingObject[maxProp], largestPossiblePadding);

    // Make sure the arrow doesn't overflow the floating element if the center
    // point is outside the floating element's bounds.
    const min = minPadding;
    const max = clientSize - arrowDimensions[length] - maxPadding;
    const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
    const offset = clamp(min, center, max);

    // If the reference is small enough that the arrow's padding causes it to
    // to point to nothing for an aligned placement, adjust the offset of the
    // floating element itself. To ensure `shift()` continues to take action,
    // a single reset is performed when this is true.
    const shouldAddOffset =
      !middlewareData.arrow &&
      getAlignment(placement) != null &&
      center !== offset &&
      rects.reference[length] / 2 -
        (center < min ? minPadding : maxPadding) -
        arrowDimensions[length] / 2 <
        0;
    const alignmentOffset = shouldAddOffset ? (center < min ? center - min : center - max) : 0;

    return {
      [axis]: coords[axis] + alignmentOffset,
      data: {
        [axis]: offset,
        centerOffset: center - offset - alignmentOffset,
        ...(shouldAddOffset && { alignmentOffset }),
      },
      reset: shouldAddOffset,
    };
  },
});

/**
 * Provides data to position an inner element of the floating element so that it
 * appears centered to the reference element.
 * This wraps the core `arrow` middleware to allow ref-like/accessor elements.
 * @see https://floating-ui.com/docs/arrow
 *
 * Solid deviation: upstream's `arrow(options, deps)` takes a React
 * `DependencyList` purely to preserve the middleware's identity across
 * re-renders (`options: [options, deps]`, compared by `@floating-ui/react-dom`
 * so `computePosition` re-runs only when `deps` changes). Solid's middleware
 * arrays are `MaybeAccessor`s that `usePosition` already re-evaluates
 * whenever they change (see `usePosition.ts`), so no such memoization hint is
 * needed — `arrow` is a plain alias for `baseArrow`.
 *
 * Not re-exported from the `floating-ui-solid` barrel: upstream's own
 * `floating-ui-react/index.ts` re-exports the vanilla `arrow` from
 * `@floating-ui/react-dom` (matching this package's barrel re-export from
 * `@floating-ui/dom`), and keeps this fork private to callers that import it
 * directly (e.g. `utils/useAnchorPositioning.ts`, not yet ported).
 */
export const arrow = baseArrow;
