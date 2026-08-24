/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import {
  autoUpdate,
  computePosition,
  type ComputePositionConfig,
  type Middleware,
  type MiddlewareData,
  type Placement,
  type ReferenceElement as DomReferenceElement,
  type Strategy,
} from '@floating-ui/dom';
import { createEffect, createMemo, onCleanup, type Accessor, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { access, type MaybeAccessor } from '../../internals/types';

export interface UsePositionOptions {
  placement?: MaybeAccessor<Placement | undefined>;
  strategy?: MaybeAccessor<Strategy | undefined>;
  middleware?: MaybeAccessor<Array<Middleware | null | undefined | false> | undefined>;
  /**
   * @default true
   */
  transform?: MaybeAccessor<boolean | undefined>;
  /**
   * Called when both the reference and floating elements are mounted, and
   * cleaned up when either unmounts. Defaults to `@floating-ui/dom`'s
   * `autoUpdate`.
   */
  whileElementsMounted?: (
    reference: DomReferenceElement,
    floating: HTMLElement,
    update: () => void,
  ) => () => void;
  /**
   * Whether the floating element is open. Used to reset `isPositioned` to
   * `false` while closed (mirrors `@floating-ui/react-dom`).
   */
  open?: Accessor<boolean | undefined>;
  elements: {
    reference: Accessor<DomReferenceElement | null>;
    floating: Accessor<HTMLElement | null>;
  };
}

interface PositionState {
  x: number;
  y: number;
  strategy: Strategy;
  placement: Placement;
  middlewareData: MiddlewareData;
  isPositioned: boolean;
}

export interface UsePositionReturn {
  x: Accessor<number>;
  y: Accessor<number>;
  strategy: Accessor<Strategy>;
  placement: Accessor<Placement>;
  middlewareData: Accessor<MiddlewareData>;
  isPositioned: Accessor<boolean>;
  floatingStyles: Accessor<JSX.CSSProperties>;
  update: () => void;
}

function getDPR(element: Element): number {
  if (typeof window === 'undefined') {
    return 1;
  }
  const win = element.ownerDocument?.defaultView || window;
  return win.devicePixelRatio || 1;
}

function roundByDPR(element: Element, value: number): number {
  const dpr = getDPR(element);
  return Math.round(value * dpr) / dpr;
}

/**
 * Solid primitive over `@floating-ui/dom`'s `computePosition`/`autoUpdate`.
 * Solid port of the position half of `@floating-ui/react-dom`'s
 * `useFloating` (React-only, so it can't be depended on directly);
 * interaction/context concerns live in `useFloating.ts`.
 *
 * Design deviation: unlike upstream (which only wires up `autoUpdate` when a
 * caller explicitly passes `whileElementsMounted: autoUpdate`), this port
 * defaults to `autoUpdate` whenever `whileElementsMounted` isn't provided —
 * per the ported design, unattended repositioning should be the default.
 */
export function usePosition(options: UsePositionOptions): UsePositionReturn {
  const placement = () => access(options.placement) ?? 'bottom';
  const strategy = () => access(options.strategy) ?? 'absolute';
  const middleware = () => access(options.middleware);
  const transform = () => access(options.transform) ?? true;

  const [state, setState] = createStore<PositionState>({
    x: 0,
    y: 0,
    strategy: strategy(),
    placement: placement(),
    middlewareData: {},
    isPositioned: false,
  });

  // Guards against a stale async `computePosition` response overwriting a
  // newer one (e.g. the reference/floating elements changed mid-flight).
  let token = 0;

  function update() {
    const referenceEl = options.elements.reference();
    const floatingEl = options.elements.floating();
    if (!referenceEl || !floatingEl) {
      return;
    }

    const config: Partial<ComputePositionConfig> = {
      placement: placement(),
      strategy: strategy(),
      middleware: middleware(),
    };

    const requestToken = ++token;
    computePosition(referenceEl, floatingEl, config).then((data) => {
      if (requestToken !== token) {
        return;
      }
      setState({
        x: data.x,
        y: data.y,
        strategy: data.strategy,
        placement: data.placement,
        middlewareData: data.middlewareData,
        // The floating element's position may be recomputed while it's
        // closed but still mounted (e.g. during a transition out). Avoid
        // setting `isPositioned` to `true` in that case so it starts `false`
        // again the next time it opens.
        isPositioned: access(options.open) !== false,
      });
    });
  }

  createEffect(() => {
    if (access(options.open) === false && state.isPositioned) {
      setState('isPositioned', false);
    }
  });

  createEffect(() => {
    const referenceEl = options.elements.reference();
    const floatingEl = options.elements.floating();
    // Track option changes so they trigger a reposition.
    placement();
    strategy();
    middleware();

    if (!referenceEl || !floatingEl) {
      return;
    }

    const cleanup = (options.whileElementsMounted ?? autoUpdate)(referenceEl, floatingEl, update);
    onCleanup(cleanup);
  });

  const floatingStyles = createMemo<JSX.CSSProperties>(() => {
    const floatingEl = options.elements.floating();
    const currentStrategy = strategy();

    if (!floatingEl) {
      return {
        position: currentStrategy,
        top: '0px',
        left: '0px',
      };
    }

    const x = roundByDPR(floatingEl, state.x);
    const y = roundByDPR(floatingEl, state.y);

    if (transform()) {
      return {
        position: currentStrategy,
        top: '0px',
        left: '0px',
        transform: `translate(${x}px, ${y}px)`,
        ...(getDPR(floatingEl) >= 1.5 ? { 'will-change': 'transform' } : null),
      };
    }

    return {
      position: currentStrategy,
      left: `${x}px`,
      top: `${y}px`,
    };
  });

  return {
    x: () => state.x,
    y: () => state.y,
    strategy: () => state.strategy,
    placement: () => state.placement,
    middlewareData: () => state.middlewareData,
    isPositioned: () => state.isPositioned,
    floatingStyles,
    update,
  };
}
