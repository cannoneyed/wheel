/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type Accessor,
  type JSX,
} from 'solid-js';
import { getAlignment, getSide, getSideAxis, type Rect } from '@floating-ui/utils';
import type {
  AutoUpdateOptions,
  Middleware,
  MiddlewareState,
  Padding,
  Placement,
  Side as PhysicalSide,
  VirtualElement,
} from '@floating-ui/dom';
import { ownerDocument, ownerWindow } from '../base-utils/owner';
import { useDirection } from '../internals/direction-context/DirectionContext';
import {
  autoUpdate,
  flip,
  limitShift,
  offset,
  shift,
  size,
  useFloating,
  type FloatingContext,
  type FloatingRootContext,
  type FloatingTreeStore,
} from '../floating-ui-solid';
import { arrow } from '../floating-ui-solid/middleware/arrow';
import { DEFAULT_SIDES } from './adaptiveOriginMiddleware';
import { hide } from './hideMiddleware';

const AVAILABLE_WIDTH_VAR = '--available-width';
const AVAILABLE_HEIGHT_VAR = '--available-height';

export type Side = 'top' | 'bottom' | 'left' | 'right' | 'inline-end' | 'inline-start';
export type Align = 'start' | 'center' | 'end';
export type Boundary = 'clipping-ancestors' | Element | Element[] | Rect;
export type OffsetFunction = (data: {
  side: Side;
  align: Align;
  anchor: { width: number; height: number };
  positioner: { width: number; height: number };
}) => number;

interface SideFlipMode {
  side?: 'flip' | 'none' | undefined;
  align?: 'flip' | 'shift' | 'none' | undefined;
  fallbackAxisSide?: 'start' | 'end' | 'none' | undefined;
}

interface SideShiftMode {
  side?: 'shift' | 'none' | undefined;
  align?: 'shift' | 'none' | undefined;
  fallbackAxisSide?: 'start' | 'end' | 'none' | undefined;
}

export type CollisionAvoidance = SideFlipMode | SideShiftMode;

/**
 * A `{ current }` ref-like object resolving to the anchor element/virtual-element, for callers
 * that keep a mutable reference instead of a signal (mirrors upstream's `React.RefObject` anchor
 * form — Solid has no ref-object convention for values, but this shape is common enough to accept
 * explicitly, same rationale as the arrow middleware's `ArrowElement`).
 */
export interface AnchorRefObject {
  readonly current: Element | VirtualElement | null;
}

export type AnchorValue =
  | Element
  | null
  | VirtualElement
  | AnchorRefObject
  | (() => Element | VirtualElement | null);

function isAnchorRefObject(value: AnchorValue | undefined | null): value is AnchorRefObject {
  return value != null && typeof value === 'object' && 'current' in value;
}

function getLogicalSide(sideParam: Side, renderedSide: PhysicalSide, isRtl: boolean): Side {
  const isLogicalSideParam = sideParam === 'inline-start' || sideParam === 'inline-end';
  const logicalRight = isRtl ? 'inline-start' : 'inline-end';
  const logicalLeft = isRtl ? 'inline-end' : 'inline-start';
  return (
    {
      top: 'top',
      right: isLogicalSideParam ? logicalRight : 'right',
      bottom: 'bottom',
      left: isLogicalSideParam ? logicalLeft : 'left',
    } satisfies Record<PhysicalSide, Side>
  )[renderedSide];
}

function getOffsetData(state: MiddlewareState, sideParam: Side, isRtl: boolean) {
  const { rects, placement } = state;
  const data = {
    side: getLogicalSide(sideParam, getSide(placement) as PhysicalSide, isRtl),
    align: (getAlignment(placement) || 'center') as Align,
    anchor: { width: rects.reference.width, height: rects.reference.height },
    positioner: { width: rects.floating.width, height: rects.floating.height },
  };
  return data;
}

/**
 * Public prop bag shape (plain values — this is what `TooltipPositioner.Props` and future
 * popups' Positioner props extend). Mirrors upstream's `UseAnchorPositioningSharedParameters`
 * exactly; the `useAnchorPositioning` function itself takes the Accessor-wrapped
 * `UseAnchorPositioningParameters` below instead, built by the caller from these prop values.
 */
export interface UseAnchorPositioningSharedParameters {
  anchor?: AnchorValue | undefined;
  positionMethod?: 'absolute' | 'fixed' | undefined;
  side?: Side | undefined;
  sideOffset?: number | OffsetFunction | undefined;
  align?: Align | undefined;
  alignOffset?: number | OffsetFunction | undefined;
  collisionBoundary?: Boundary | undefined;
  collisionPadding?: Padding | undefined;
  sticky?: boolean | undefined;
  arrowPadding?: number | undefined;
  disableAnchorTracking?: boolean | undefined;
  collisionAvoidance?: CollisionAvoidance | undefined;
}

/**
 * Deviation: fields here are plain `Accessor<T>`s (not `MaybeAccessor<T>`) — several of the shared
 * fields (`sideOffset`, `alignOffset`) are themselves unions that include a function type
 * (`OffsetFunction`), which makes `T | (() => T)` genuinely ambiguous (a plain `OffsetFunction`
 * value structurally satisfies `() => T` too). Every caller (each Positioner) already has its prop
 * values wrapped in accessors by the time it calls `useAnchorPositioning`, so this just avoids that
 * ambiguity rather than losing anything.
 */
export interface UseAnchorPositioningParameters {
  anchor?: Accessor<AnchorValue | undefined> | undefined;
  positionMethod?: Accessor<'absolute' | 'fixed' | undefined> | undefined;
  side?: Accessor<Side | undefined> | undefined;
  sideOffset?: Accessor<number | OffsetFunction | undefined> | undefined;
  align?: Accessor<Align | undefined> | undefined;
  alignOffset?: Accessor<number | OffsetFunction | undefined> | undefined;
  collisionBoundary?: Accessor<Boundary | undefined> | undefined;
  collisionPadding?: Accessor<Padding | undefined> | undefined;
  sticky?: Accessor<boolean | undefined> | undefined;
  arrowPadding?: Accessor<number | undefined> | undefined;
  disableAnchorTracking?: Accessor<boolean | undefined> | undefined;
  keepMounted?: Accessor<boolean | undefined> | undefined;
  floatingRootContext?: FloatingRootContext | undefined;
  mounted: Accessor<boolean>;
  nodeId?: string | undefined;
  adaptiveOrigin?: Middleware | undefined;
  collisionAvoidance: Accessor<CollisionAvoidance | undefined>;
  shiftCrossAxis?: Accessor<boolean | undefined> | undefined;
  lazyFlip?: Accessor<boolean | undefined> | undefined;
  externalTree?: FloatingTreeStore | undefined;
  inline?: Middleware | undefined;
}

export interface UseAnchorPositioningReturnValue {
  positionerStyles: Accessor<JSX.CSSProperties>;
  arrowStyles: Accessor<JSX.CSSProperties>;
  setArrowElement: (element: Element | null) => void;
  arrowUncentered: Accessor<boolean>;
  side: Accessor<Side>;
  align: Accessor<Align>;
  physicalSide: Accessor<PhysicalSide>;
  anchorHidden: Accessor<boolean>;
  refs: ReturnType<typeof useFloating>['refs'];
  context: FloatingContext;
  isPositioned: Accessor<boolean>;
  update: () => void;
}

/**
 * Provides standardized anchor positioning behavior for floating elements. Wraps `useFloating`.
 * Solid port of upstream's `useAnchorPositioning` — shared by every popup's Positioner part
 * (Tooltip is the first to use it; Popover/Menu/Select etc. should build on this rather than
 * duplicate it).
 *
 * Deviations from upstream:
 * - The arrow element is exposed as a `setArrowElement` ref-callback setter instead of a
 *   `React.RefObject`; the `arrow` middleware here (see `floating-ui-solid/middleware/arrow.ts`)
 *   accepts a zero-arg accessor for exactly this reason.
 * - Upstream splits anchor-ref resolution across a `useIsoLayoutEffect` (for non-function anchors)
 *   and a plain `useEffect` (for `RefObject` anchors) because React sets a parent's ref only after
 *   its own layout effects flush, so a ref-based anchor isn't available yet during this hook's
 *   layout effect. Solid has no such phase split — refs are assigned synchronously as elements are
 *   created — so both cases are resolved in a single `createEffect` here.
 * - Upstream memoizes autoUpdate options via `useMemo`; here they're a derived accessor.
 */
export function useAnchorPositioning(
  params: UseAnchorPositioningParameters,
): UseAnchorPositioningReturnValue {
  const anchor = () => params.anchor?.();
  const positionMethod = () => params.positionMethod?.() ?? 'absolute';
  const sideParam = () => params.side?.() ?? 'bottom';
  const sideOffsetParam = () => params.sideOffset?.() ?? 0;
  const align = () => params.align?.() ?? 'center';
  const alignOffsetParam = () => params.alignOffset?.() ?? 0;
  const collisionBoundary = () => params.collisionBoundary?.() ?? 'clipping-ancestors';
  const collisionPaddingParam = () => params.collisionPadding?.() ?? 5;
  const sticky = () => params.sticky?.() ?? false;
  const arrowPadding = () => params.arrowPadding?.() ?? 5;
  const disableAnchorTracking = () => params.disableAnchorTracking?.() ?? false;
  const keepMounted = () => params.keepMounted?.() ?? false;
  const collisionAvoidance = () => params.collisionAvoidance();
  const shiftCrossAxis = () => params.shiftCrossAxis?.() ?? false;
  const lazyFlip = () => params.lazyFlip?.() ?? false;
  const mounted = params.mounted;
  const floatingRootContext = params.floatingRootContext;

  const [mountSide, setMountSide] = createSignal<PhysicalSide | null>(null);

  createEffect(() => {
    if (!mounted() && mountSide() !== null) {
      setMountSide(null);
    }
  });

  const direction = useDirection();
  const isRtl = () => direction() === 'rtl';

  const physicalSideFromParam = createMemo<PhysicalSide>(() => {
    const locked = mountSide();
    if (locked) {
      return locked;
    }
    return (
      {
        top: 'top',
        right: 'right',
        bottom: 'bottom',
        left: 'left',
        'inline-end': isRtl() ? 'left' : 'right',
        'inline-start': isRtl() ? 'right' : 'left',
      } satisfies Record<Side, PhysicalSide>
    )[sideParam()];
  });

  const placement = createMemo<Placement>(() => {
    const alignValue = align();
    const sideValue = physicalSideFromParam();
    return alignValue === 'center' ? sideValue : (`${sideValue}-${alignValue}` as Placement);
  });

  const collisionPadding = createMemo(() => {
    const value = collisionPaddingParam();
    if (typeof value === 'number') {
      return { top: value, right: value, bottom: value, left: value };
    }
    return {
      top: value?.top || 0,
      right: value?.right || 0,
      bottom: value?.bottom || 0,
      left: value?.left || 0,
    };
  });

  let arrowElement: Element | null = null;
  const setArrowElement = (element: Element | null) => {
    arrowElement = element;
  };

  const commonCollisionProps = createMemo(() => ({
    boundary:
      collisionBoundary() === 'clipping-ancestors'
        ? ('clippingAncestors' as const)
        : (collisionBoundary() as Exclude<Boundary, 'clipping-ancestors'>),
    padding: collisionPadding(),
  }));

  const middleware = createMemo<Array<Middleware | null | undefined | false>>(() => {
    const sideValue = sideParam();
    const alignValue = align();
    const avoidance = collisionAvoidance() ?? {};
    const collisionAvoidanceSide = avoidance.side || 'flip';
    const collisionAvoidanceAlign = avoidance.align || 'flip';
    const collisionAvoidanceFallbackAxisSide = avoidance.fallbackAxisSide || 'end';

    // Create a bias to the preferred side, matching upstream (iOS software-keyboard flip guard).
    const bias = 1;
    const biasTop = sideValue === 'bottom' ? bias : 0;
    const biasBottom = sideValue === 'top' ? bias : 0;
    const biasLeft = sideValue === 'right' ? bias : 0;
    const biasRight = sideValue === 'left' ? bias : 0;

    const padding = collisionPadding();
    const common = commonCollisionProps();

    const result: Array<Middleware | null | undefined | false> = [];

    if (params.inline) {
      result.push(params.inline);
    }

    result.push(
      offset((state) => {
        const data = getOffsetData(state, sideValue, isRtl());
        const sideOffsetValue = sideOffsetParam();
        const alignOffsetValue = alignOffsetParam();
        const sideAxis = typeof sideOffsetValue === 'function' ? sideOffsetValue(data) : sideOffsetValue;
        const alignAxis = typeof alignOffsetValue === 'function' ? alignOffsetValue(data) : alignOffsetValue;
        return {
          mainAxis: sideAxis,
          crossAxis: alignAxis,
          alignmentAxis: alignAxis,
        };
      }),
    );

    const shiftDisabled = collisionAvoidanceAlign === 'none' && collisionAvoidanceSide !== 'shift';
    const crossAxisShiftEnabled =
      !shiftDisabled && (sticky() || shiftCrossAxis() || collisionAvoidanceSide === 'shift');

    const flipMiddleware =
      collisionAvoidanceSide === 'none'
        ? null
        : flip({
            ...common,
            padding: {
              top: padding.top + bias + biasTop,
              right: padding.right + bias + biasRight,
              bottom: padding.bottom + bias + biasBottom,
              left: padding.left + bias + biasLeft,
            },
            mainAxis: !shiftCrossAxis() && collisionAvoidanceSide === 'flip',
            crossAxis: collisionAvoidanceAlign === 'flip' ? 'alignment' : false,
            fallbackAxisSideDirection: collisionAvoidanceFallbackAxisSide,
          });

    const shiftMiddleware = shiftDisabled
      ? null
      : shift((data) => {
          const html = ownerDocument(data.elements.floating as HTMLElement).documentElement;
          return {
            ...common,
            rootBoundary: shiftCrossAxis()
              ? { x: 0, y: 0, width: html.clientWidth, height: html.clientHeight }
              : undefined,
            mainAxis: collisionAvoidanceAlign !== 'none',
            crossAxis: crossAxisShiftEnabled,
            limiter:
              sticky() || shiftCrossAxis()
                ? undefined
                : limitShift((limitData) => {
                    if (!arrowElement) {
                      return {};
                    }
                    const { width, height } = arrowElement.getBoundingClientRect();
                    const sideAxis = getSideAxis(getSide(limitData.placement));
                    const arrowSize = sideAxis === 'y' ? width : height;
                    const offsetAmount =
                      sideAxis === 'y' ? padding.left + padding.right : padding.top + padding.bottom;
                    return {
                      offset: arrowSize / 2 + offsetAmount / 2,
                    };
                  }),
          };
        });

    // https://floating-ui.com/docs/flip#combining-with-shift
    if (
      collisionAvoidanceSide === 'shift' ||
      collisionAvoidanceAlign === 'shift' ||
      alignValue === 'center'
    ) {
      result.push(shiftMiddleware, flipMiddleware);
    } else {
      result.push(flipMiddleware, shiftMiddleware);
    }

    result.push(
      size({
        ...common,
        apply({ elements: { floating }, availableWidth, availableHeight, rects }) {
          if (!mounted()) {
            return;
          }

          const floatingStyle = (floating as HTMLElement).style;
          floatingStyle.setProperty(AVAILABLE_WIDTH_VAR, `${availableWidth}px`);
          floatingStyle.setProperty(AVAILABLE_HEIGHT_VAR, `${availableHeight}px`);

          const dpr = ownerWindow(floating as HTMLElement).devicePixelRatio || 1;
          const { x, y, width, height } = rects.reference;
          const anchorWidth = (Math.round((x + width) * dpr) - Math.round(x * dpr)) / dpr;
          const anchorHeight = (Math.round((y + height) * dpr) - Math.round(y * dpr)) / dpr;

          floatingStyle.setProperty('--anchor-width', `${anchorWidth}px`);
          floatingStyle.setProperty('--anchor-height', `${anchorHeight}px`);
        },
      }),
      arrow({
        element: () => arrowElement,
        padding: arrowPadding(),
        offsetParent: 'floating',
      }),
      {
        name: 'transformOrigin',
        fn(state) {
          const { elements, middlewareData, placement: renderedPlacement, rects, y } = state;

          const currentRenderedSide = getSide(renderedPlacement);
          const currentRenderedAxis = getSideAxis(currentRenderedSide);
          const arrowX = middlewareData.arrow?.x || 0;
          const arrowY = middlewareData.arrow?.y || 0;
          const arrowWidth = (arrowElement as HTMLElement | null)?.clientWidth || 0;
          const arrowHeight = (arrowElement as HTMLElement | null)?.clientHeight || 0;
          const transformX = arrowX + arrowWidth / 2;
          const transformY = arrowY + arrowHeight / 2;
          const shiftY = Math.abs(middlewareData.shift?.y || 0);
          const halfAnchorHeight = rects.reference.height / 2;
          const sideOffsetValue = sideOffsetParam();
          const resolvedSideOffset =
            typeof sideOffsetValue === 'function'
              ? sideOffsetValue(getOffsetData(state, sideValue, isRtl()))
              : sideOffsetValue;
          const isOverlappingAnchor = shiftY > resolvedSideOffset;

          const adjacentTransformOrigin = {
            top: `${transformX}px calc(100% + ${resolvedSideOffset}px)`,
            bottom: `${transformX}px ${-resolvedSideOffset}px`,
            left: `calc(100% + ${resolvedSideOffset}px) ${transformY}px`,
            right: `${-resolvedSideOffset}px ${transformY}px`,
          }[currentRenderedSide];
          const overlapTransformOrigin = `${transformX}px ${rects.reference.y + halfAnchorHeight - y}px`;

          (elements.floating as HTMLElement).style.setProperty(
            '--transform-origin',
            crossAxisShiftEnabled && currentRenderedAxis === 'y' && isOverlappingAnchor
              ? overlapTransformOrigin
              : adjacentTransformOrigin,
          );

          return {};
        },
      },
      hide,
      params.adaptiveOrigin,
    );

    return result;
  });

  createEffect(() => {
    if (!mounted() && floatingRootContext) {
      floatingRootContext.update({
        referenceElement: null,
        floatingElement: null,
        domReferenceElement: null,
        positionReference: null,
      });
    }
  });

  const autoUpdateOptions = createMemo<AutoUpdateOptions>(() => ({
    elementResize: !disableAnchorTracking() && typeof ResizeObserver !== 'undefined',
    layoutShift: !disableAnchorTracking() && typeof IntersectionObserver !== 'undefined',
  }));

  const {
    refs,
    elements,
    x,
    y,
    middlewareData,
    update,
    placement: renderedPlacement,
    context,
    isPositioned,
    floatingStyles: originalFloatingStyles,
  } = useFloating({
    rootContext: floatingRootContext,
    open: () => (keepMounted() ? mounted() : undefined),
    placement,
    middleware,
    strategy: positionMethod,
    whileElementsMounted: keepMounted()
      ? undefined
      : (...args) => autoUpdate(...args, autoUpdateOptions()),
    nodeId: params.nodeId,
    externalTree: params.externalTree,
  });

  const adaptiveOriginSides = () => middlewareData().adaptiveOrigin ?? DEFAULT_SIDES;

  const resolvedPosition = (): 'absolute' | 'fixed' =>
    isPositioned() ? positionMethod() : 'fixed';

  const floatingStyles = createMemo<JSX.CSSProperties>(() => {
    const { sideX, sideY } = adaptiveOriginSides();
    const base: Record<string, string | number> = params.adaptiveOrigin
      ? { position: resolvedPosition(), [sideX]: x(), [sideY]: y() }
      : { position: resolvedPosition(), ...(originalFloatingStyles() as Record<string, any>) };

    // Seed the available size vars so consumer `max-height: min(x, var(--available-height))`
    // rules resolve to a valid length on the first positioning pass (see upstream's comment).
    base[AVAILABLE_WIDTH_VAR] = '100vw';
    base[AVAILABLE_HEIGHT_VAR] = '100vh';

    if (!isPositioned()) {
      base.opacity = 0;
    }
    return base as JSX.CSSProperties;
  });

  let registeredPositionReference: Element | VirtualElement | null = null;

  createEffect(() => {
    if (!mounted()) {
      return;
    }

    const anchorValue = anchor();
    const resolved = typeof anchorValue === 'function' ? anchorValue() : anchorValue;
    const unwrapped = isAnchorRefObject(resolved) ? resolved.current : resolved;
    const finalAnchor = unwrapped ?? null;

    if (finalAnchor !== registeredPositionReference) {
      refs.setPositionReference(finalAnchor);
      registeredPositionReference = finalAnchor;
    }
  });

  createEffect(() => {
    if (keepMounted() && mounted()) {
      const referenceEl = elements.reference();
      const floatingEl = elements.floating();
      if (referenceEl && floatingEl) {
        const cleanup = autoUpdate(referenceEl, floatingEl, update, autoUpdateOptions());
        onCleanup(cleanup);
      }
    }
  });

  const renderedSide = () => getSide(renderedPlacement()) as PhysicalSide;
  const logicalRenderedSide = () => getLogicalSide(sideParam(), renderedSide(), isRtl());
  const renderedAlign = (): Align => (getAlignment(renderedPlacement()) as Align) || 'center';
  const anchorHidden = () => Boolean(middlewareData().hide?.referenceHidden);

  createEffect(() => {
    if (lazyFlip() && mounted() && isPositioned()) {
      setMountSide(renderedSide());
    }
  });

  const arrowStyles = createMemo<JSX.CSSProperties>(() => {
    const arrowData = middlewareData().arrow;
    return {
      position: 'absolute' as const,
      top: arrowData?.y !== undefined ? `${arrowData.y}px` : undefined,
      left: arrowData?.x !== undefined ? `${arrowData.x}px` : undefined,
    };
  });

  const arrowUncentered = () => middlewareData().arrow?.centerOffset !== 0;

  return {
    positionerStyles: floatingStyles,
    arrowStyles,
    setArrowElement,
    arrowUncentered,
    side: logicalRenderedSide,
    align: renderedAlign,
    physicalSide: renderedSide,
    anchorHidden,
    refs,
    context,
    isPositioned,
    update,
  };
}
