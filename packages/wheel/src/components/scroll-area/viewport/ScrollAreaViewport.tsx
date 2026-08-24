/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, onMount, splitProps, type JSX } from 'solid-js';
import { platform } from '../../base-utils/platform/index';
import { createTimeout } from '../../base-utils/createTimeout';
import { ownerDocument } from '../../base-utils/owner';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { clamp } from '../../internals/clamp';
import { useDirection } from '../../internals/direction-context/DirectionContext';
import { useScrollAreaRootContext } from '../root/ScrollAreaRootContext';
import { scrollAreaStateAttributesMapping } from '../root/stateAttributesMapping';
import type { HiddenState, ScrollAreaRootState } from '../root/ScrollAreaRoot';
import { MIN_THUMB_SIZE } from '../constants';
import { getOffset } from '../utils/getOffset';
import { normalizeScrollOffset } from '../../utils/scrollEdges';
import { styleDisableScrollbar } from '../utils/styleDisableScrollbar';
import { ScrollAreaViewportCssVars } from './ScrollAreaViewportCssVars';
import {
  ScrollAreaViewportContext,
  type ScrollAreaViewportContextValue,
} from './ScrollAreaViewportContext';

// Module-level flag to ensure we only register the CSS properties once,
// regardless of how many Scroll Area components are mounted.
let scrollAreaOverflowVarsRegistered = false;

/**
 * Removes inheritance of the scroll area overflow CSS variables, which
 * improves rendering performance in complex scroll areas with deep subtrees.
 * Instead, each child must manually opt-in to using these properties by
 * specifying `inherit`.
 * See https://motion.dev/blog/web-animation-performance-tier-list
 * under the "Improving CSS variable performance" section.
 */
function removeCSSVariableInheritance() {
  if (
    scrollAreaOverflowVarsRegistered ||
    // When `inherits: false`, specifying `inherit` on child elements doesn't work
    // in Safari. To let CSS features work correctly, this optimization must be skipped.
    platform.engine.webkit
  ) {
    return;
  }

  if (typeof CSS !== 'undefined' && 'registerProperty' in CSS) {
    [
      ScrollAreaViewportCssVars.scrollAreaOverflowXStart,
      ScrollAreaViewportCssVars.scrollAreaOverflowXEnd,
      ScrollAreaViewportCssVars.scrollAreaOverflowYStart,
      ScrollAreaViewportCssVars.scrollAreaOverflowYEnd,
    ].forEach((name) => {
      try {
        CSS.registerProperty({
          name,
          syntax: '<length>',
          inherits: false,
          initialValue: '0px',
        });
      } catch {
        /* ignore already-registered */
      }
    });
  }

  scrollAreaOverflowVarsRegistered = true;
}

function getHiddenState(viewport: HTMLElement): HiddenState {
  const y = viewport.clientHeight >= viewport.scrollHeight;
  const x = viewport.clientWidth >= viewport.scrollWidth;

  return {
    y,
    x,
    corner: y || x,
  };
}

function mergeHiddenState(prevState: HiddenState, nextState: HiddenState) {
  if (
    prevState.y === nextState.y &&
    prevState.x === nextState.x &&
    prevState.corner === nextState.corner
  ) {
    return prevState;
  }

  return nextState;
}

/**
 * The actual scrollable container of the scroll area.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Scroll Area](https://base-ui.com/react/components/scroll-area)
 */
export function ScrollAreaViewport(componentProps: ScrollAreaViewport.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
  ]);

  const {
    viewportRef,
    scrollbarYRef,
    scrollbarXRef,
    thumbYRef,
    thumbXRef,
    cornerRef,
    cornerSize,
    setCornerSize,
    setThumbSize,
    rootId,
    setHiddenState,
    hiddenState,
    setHasMeasuredScrollbar,
    handleScroll,
    setHovering,
    setOverflowEdges,
    overflowEdges,
    overflowEdgeThreshold,
    scrollingX,
    scrollingY,
    viewportState,
  } = useScrollAreaRootContext();

  const direction = useDirection();

  let programmaticScroll = true;
  const lastMeasuredViewportMetrics: [number, number, number, number] = [NaN, NaN, NaN, NaN];

  const scrollEndTimeout = createTimeout();
  const waitForAnimationsTimeout = createTimeout();

  function computeThumbPosition() {
    const viewportEl = viewportRef.current;
    const scrollbarYEl = scrollbarYRef.current;
    const scrollbarXEl = scrollbarXRef.current;
    const thumbYEl = thumbYRef.current;
    const thumbXEl = thumbXRef.current;
    const cornerEl = cornerRef.current;

    if (!viewportEl) {
      return;
    }

    const scrollableContentHeight = viewportEl.scrollHeight;
    const scrollableContentWidth = viewportEl.scrollWidth;
    const viewportHeight = viewportEl.clientHeight;
    const viewportWidth = viewportEl.clientWidth;
    const scrollTop = viewportEl.scrollTop;
    const scrollLeft = viewportEl.scrollLeft;
    const isFirstMeasurement = Number.isNaN(lastMeasuredViewportMetrics[0]);

    lastMeasuredViewportMetrics[0] = viewportHeight;
    lastMeasuredViewportMetrics[1] = scrollableContentHeight;
    lastMeasuredViewportMetrics[2] = viewportWidth;
    lastMeasuredViewportMetrics[3] = scrollableContentWidth;

    if (isFirstMeasurement) {
      setHasMeasuredScrollbar(true);
    }

    if (scrollableContentHeight === 0 || scrollableContentWidth === 0) {
      return;
    }

    const nextHiddenState = getHiddenState(viewportEl);
    const scrollbarYHidden = nextHiddenState.y;
    const scrollbarXHidden = nextHiddenState.x;
    const ratioX = viewportWidth / scrollableContentWidth;
    const ratioY = viewportHeight / scrollableContentHeight;
    const maxScrollLeft = Math.max(0, scrollableContentWidth - viewportWidth);
    const maxScrollTop = Math.max(0, scrollableContentHeight - viewportHeight);

    let scrollLeftFromStart = 0;
    let scrollLeftFromEnd = 0;
    if (!scrollbarXHidden) {
      let rawScrollLeftFromStart = 0;
      if (direction() === 'rtl') {
        rawScrollLeftFromStart = clamp(-scrollLeft, 0, maxScrollLeft);
      } else {
        rawScrollLeftFromStart = clamp(scrollLeft, 0, maxScrollLeft);
      }
      scrollLeftFromStart = normalizeScrollOffset(rawScrollLeftFromStart, maxScrollLeft);
      scrollLeftFromEnd = maxScrollLeft - scrollLeftFromStart;
    }

    const rawScrollTopFromStart = !scrollbarYHidden ? clamp(scrollTop, 0, maxScrollTop) : 0;
    const scrollTopFromStart = !scrollbarYHidden
      ? normalizeScrollOffset(rawScrollTopFromStart, maxScrollTop)
      : 0;
    const scrollTopFromEnd = !scrollbarYHidden ? maxScrollTop - scrollTopFromStart : 0;
    const nextWidth = scrollbarXHidden ? 0 : viewportWidth;
    const nextHeight = scrollbarYHidden ? 0 : viewportHeight;

    let nextCornerWidth = 0;
    let nextCornerHeight = 0;
    if (!scrollbarXHidden && !scrollbarYHidden) {
      nextCornerWidth = scrollbarYEl?.offsetWidth || 0;
      nextCornerHeight = scrollbarXEl?.offsetHeight || 0;
    }

    // Only subtract corner size from scrollbar dimensions if the corner hasn't been sized yet.
    // Once sized, the layout will already account for it.
    const currentCornerSize = cornerSize();
    const cornerNotYetSized = currentCornerSize.width === 0 && currentCornerSize.height === 0;
    const cornerWidthOffset = cornerNotYetSized ? nextCornerWidth : 0;
    const cornerHeightOffset = cornerNotYetSized ? nextCornerHeight : 0;

    const scrollbarXOffset = getOffset(scrollbarXEl, 'padding', 'x');
    const scrollbarYOffset = getOffset(scrollbarYEl, 'padding', 'y');
    const thumbXOffset = getOffset(thumbXEl, 'margin', 'x');
    const thumbYOffset = getOffset(thumbYEl, 'margin', 'y');

    const idealNextWidth = nextWidth - scrollbarXOffset - thumbXOffset;
    const idealNextHeight = nextHeight - scrollbarYOffset - thumbYOffset;

    const maxNextWidth = scrollbarXEl
      ? Math.min(scrollbarXEl.offsetWidth - cornerWidthOffset, idealNextWidth)
      : idealNextWidth;
    const maxNextHeight = scrollbarYEl
      ? Math.min(scrollbarYEl.offsetHeight - cornerHeightOffset, idealNextHeight)
      : idealNextHeight;

    const clampedNextWidth = Math.max(MIN_THUMB_SIZE, maxNextWidth * ratioX);
    const clampedNextHeight = Math.max(MIN_THUMB_SIZE, maxNextHeight * ratioY);

    setThumbSize((prevSize) => {
      if (prevSize.height === clampedNextHeight && prevSize.width === clampedNextWidth) {
        return prevSize;
      }

      return {
        width: clampedNextWidth,
        height: clampedNextHeight,
      };
    });

    // Handle Y (vertical) scroll
    if (scrollbarYEl && thumbYEl) {
      const maxThumbOffsetY =
        scrollbarYEl.offsetHeight - clampedNextHeight - scrollbarYOffset - thumbYOffset;
      const scrollRangeY = scrollableContentHeight - viewportHeight;
      const scrollRatioY = scrollRangeY === 0 ? 0 : scrollTop / scrollRangeY;

      // In Safari, don't allow it to go negative or too far as `scrollTop` considers the rubber
      // band effect.
      const thumbOffsetY = Math.min(maxThumbOffsetY, Math.max(0, scrollRatioY * maxThumbOffsetY));

      thumbYEl.style.transform = `translate3d(0,${thumbOffsetY}px,0)`;
    }

    // Handle X (horizontal) scroll
    if (scrollbarXEl && thumbXEl) {
      const maxThumbOffsetX =
        scrollbarXEl.offsetWidth - clampedNextWidth - scrollbarXOffset - thumbXOffset;
      const scrollRangeX = scrollableContentWidth - viewportWidth;
      const scrollRatioX = scrollRangeX === 0 ? 0 : scrollLeft / scrollRangeX;

      // In Safari, don't allow it to go negative or too far as `scrollLeft` considers the rubber
      // band effect.
      const thumbOffsetX =
        direction() === 'rtl'
          ? clamp(scrollRatioX * maxThumbOffsetX, -maxThumbOffsetX, 0)
          : clamp(scrollRatioX * maxThumbOffsetX, 0, maxThumbOffsetX);

      thumbXEl.style.transform = `translate3d(${thumbOffsetX}px,0,0)`;
    }

    const overflowMetricsPx: Array<[ScrollAreaViewportCssVars, number]> = [
      [ScrollAreaViewportCssVars.scrollAreaOverflowXStart, scrollLeftFromStart],
      [ScrollAreaViewportCssVars.scrollAreaOverflowXEnd, scrollLeftFromEnd],
      [ScrollAreaViewportCssVars.scrollAreaOverflowYStart, scrollTopFromStart],
      [ScrollAreaViewportCssVars.scrollAreaOverflowYEnd, scrollTopFromEnd],
    ];

    for (const [cssVar, value] of overflowMetricsPx) {
      viewportEl.style.setProperty(cssVar, `${value}px`);
    }

    if (cornerEl) {
      // Bail when the size is unchanged (like `setThumbSize` above); otherwise a
      // fresh object literal on every scroll frame rebuilds the root context and
      // re-renders every scroll-area part.
      if (scrollbarXHidden || scrollbarYHidden) {
        setCornerSize((prevSize) =>
          prevSize.width === 0 && prevSize.height === 0 ? prevSize : { width: 0, height: 0 },
        );
      } else if (!scrollbarXHidden && !scrollbarYHidden) {
        setCornerSize((prevSize) =>
          prevSize.width === nextCornerWidth && prevSize.height === nextCornerHeight
            ? prevSize
            : { width: nextCornerWidth, height: nextCornerHeight },
        );
      }
    }

    setHiddenState((prevState) => mergeHiddenState(prevState, nextHiddenState));

    const nextOverflowEdges = {
      xStart: !scrollbarXHidden && scrollLeftFromStart > overflowEdgeThreshold().xStart,
      xEnd: !scrollbarXHidden && scrollLeftFromEnd > overflowEdgeThreshold().xEnd,
      yStart: !scrollbarYHidden && scrollTopFromStart > overflowEdgeThreshold().yStart,
      yEnd: !scrollbarYHidden && scrollTopFromEnd > overflowEdgeThreshold().yEnd,
    };

    setOverflowEdges((prev) => {
      if (
        prev.xStart === nextOverflowEdges.xStart &&
        prev.xEnd === nextOverflowEdges.xEnd &&
        prev.yStart === nextOverflowEdges.yStart &&
        prev.yEnd === nextOverflowEdges.yEnd
      ) {
        return prev;
      }
      return nextOverflowEdges;
    });
  }

  // One-time mount setup: register the CSS custom properties, inject the hidden-native-scrollbar
  // style, and sync the initial `:hover` state (`pointerenter` doesn't fire retroactively for a
  // pointer already over the viewport at mount).
  onMount(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    styleDisableScrollbar.ensureInjected(ownerDocument(viewport));
    removeCSSVariableInheritance();

    if (viewport.matches(':hover')) {
      setHovering(true);
    }
  });

  // Wait for scrollbar and thumb refs after hidden-state toggles, refresh math on direction
  // flips, and re-evaluate overflow edges when the threshold changes.
  createEffect(() => {
    hiddenState();
    direction();
    const threshold = overflowEdgeThreshold();
    void threshold.xStart;
    void threshold.xEnd;
    void threshold.yStart;
    void threshold.yEnd;
    queueMicrotask(computeThumbPosition);
  });

  onMount(() => {
    const viewport = viewportRef.current;
    if (typeof ResizeObserver === 'undefined' || !viewport) {
      return;
    }

    let hasInitialized = false;
    const resizeObserver = new ResizeObserver(() => {
      // Avoid duplicate mount-time recompute when observer data matches what the mount
      // scheduling pass already measured. If dimensions changed before the first observer
      // delivery, keep the recompute so overflow transitions stay in sync.
      if (!hasInitialized) {
        hasInitialized = true;
        if (
          lastMeasuredViewportMetrics[0] === viewport.clientHeight &&
          lastMeasuredViewportMetrics[1] === viewport.scrollHeight &&
          lastMeasuredViewportMetrics[2] === viewport.clientWidth &&
          lastMeasuredViewportMetrics[3] === viewport.scrollWidth
        ) {
          return;
        }
      }

      computeThumbPosition();
    });

    resizeObserver.observe(viewport);

    // Wait for subtree animations to finish, then recompute thumb geometry that
    // may have been affected by transform-based animations.
    waitForAnimationsTimeout.start(0, () => {
      const animations = viewport.getAnimations({ subtree: true });
      if (animations.length === 0) {
        return;
      }

      Promise.allSettled(animations.map((animation) => animation.finished))
        .then(computeThumbPosition)
        .catch(() => {});
    });

    onCleanup(() => {
      resizeObserver.disconnect();
      waitForAnimationsTimeout.clear();
    });
  });

  function handleUserInteraction() {
    programmaticScroll = false;
  }

  const contextValue: ScrollAreaViewportContextValue = {
    computeThumbPosition,
  };

  return (
    <ScrollAreaViewportContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-ScrollArea-Viewport',
        slot: 'scroll-area-viewport',
        state: viewportState,
        ref: (el: HTMLElement) => {
          viewportRef.current = el;
        },
        props: [
          () => ({
            role: 'presentation',
            ...(rootId() ? { 'data-id': `${rootId()}-viewport` } : {}),
            // https://accessibilityinsights.io/info-examples/web/scrollable-region-focusable/
            // Keep non-scrollable viewports out of tab order.
            tabIndex: hiddenState().x && hiddenState().y ? -1 : 0,
            class: styleDisableScrollbar.className,
            style: {
              overflow: 'scroll',
            },
            onScroll() {
              if (!viewportRef.current) {
                return;
              }

              computeThumbPosition();

              if (!programmaticScroll) {
                handleScroll({
                  x: viewportRef.current.scrollLeft,
                  y: viewportRef.current.scrollTop,
                });
              }

              // Debounce the restoration of the programmatic flag so that it only
              // flips back to `true` once scrolling has come to a rest. This ensures
              // that momentum scrolling (where no further user-interaction events fire)
              // is still treated as user-driven.
              // 100 ms without scroll events ≈ scroll end
              // https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollend_event
              scrollEndTimeout.start(100, () => {
                programmaticScroll = true;
              });
            },
            onWheel: handleUserInteraction,
            onTouchMove: handleUserInteraction,
            onPointerMove: handleUserInteraction,
            onPointerEnter: handleUserInteraction,
            onKeyDown: handleUserInteraction,
          }),
          elementProps as HTMLProps,
        ],
        stateAttributesMapping: scrollAreaStateAttributesMapping,
      })}
    </ScrollAreaViewportContext.Provider>
  );
}

export interface ScrollAreaViewportState extends ScrollAreaRootState {}

export interface ScrollAreaViewportProps
  extends BaseUIComponentProps<'div', ScrollAreaViewportState> {}

export namespace ScrollAreaViewport {
  export type Props = ScrollAreaViewportProps;
  export type State = ScrollAreaViewportState;
}
