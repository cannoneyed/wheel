/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createSignal, splitProps, type JSX } from 'solid-js';
import { createTimeout } from '../../base-utils/createTimeout';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { renderElement } from '../../internals/renderElement';
import { contains } from '../../internals/shadowDom';
import { SCROLL_TIMEOUT } from '../constants';
import { getOffset } from '../utils/getOffset';
import { ScrollAreaScrollbarDataAttributes } from '../scrollbar/ScrollAreaScrollbarDataAttributes';
import { ScrollAreaRootCssVars } from './ScrollAreaRootCssVars';
import { scrollAreaStateAttributesMapping } from './stateAttributesMapping';
import { ScrollAreaRootContext, type ScrollAreaRootContextValue } from './ScrollAreaRootContext';

const DEFAULT_COORDS = { x: 0, y: 0 };
const DEFAULT_SIZE = { width: 0, height: 0 };
const DEFAULT_OVERFLOW_EDGES = { xStart: false, xEnd: false, yStart: false, yEnd: false };
const DEFAULT_HIDDEN_STATE = { x: true, y: true, corner: true };

export type HiddenState = typeof DEFAULT_HIDDEN_STATE;
export type OverflowEdges = typeof DEFAULT_OVERFLOW_EDGES;
export type Size = typeof DEFAULT_SIZE;
export type Coords = typeof DEFAULT_COORDS;

function normalizeOverflowEdgeThreshold(
  threshold: ScrollAreaRoot.Props['overflowEdgeThreshold'] | undefined,
) {
  if (typeof threshold === 'number') {
    const value = Math.max(0, threshold);
    return {
      xStart: value,
      xEnd: value,
      yStart: value,
      yEnd: value,
    };
  }

  return {
    xStart: Math.max(0, threshold?.xStart || 0),
    xEnd: Math.max(0, threshold?.xEnd || 0),
    yStart: Math.max(0, threshold?.yStart || 0),
    yEnd: Math.max(0, threshold?.yEnd || 0),
  };
}

/**
 * Groups all parts of the scroll area.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Scroll Area](https://base-ui.com/react/components/scroll-area)
 */
export function ScrollAreaRoot(componentProps: ScrollAreaRoot.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'overflowEdgeThreshold',
  ]);

  const overflowEdgeThreshold = () =>
    normalizeOverflowEdgeThreshold(componentProps.overflowEdgeThreshold);

  const rootId = createBaseUiId();

  const scrollYTimeout = createTimeout();
  const scrollXTimeout = createTimeout();

  const [hovering, setHovering] = createSignal(false);
  const [scrollingX, setScrollingX] = createSignal(false);
  const [scrollingY, setScrollingY] = createSignal(false);
  const [touchModality, setTouchModality] = createSignal(false);
  const [hasMeasuredScrollbar, setHasMeasuredScrollbar] = createSignal(false);
  const [cornerSize, setCornerSize] = createSignal<Size>(DEFAULT_SIZE);
  const [thumbSize, setThumbSize] = createSignal<Size>(DEFAULT_SIZE);
  const [overflowEdges, setOverflowEdges] = createSignal(DEFAULT_OVERFLOW_EDGES);
  const [hiddenState, setHiddenState] = createSignal(DEFAULT_HIDDEN_STATE);

  const rootRef: { current: HTMLElement | null } = { current: null };
  const viewportRef: { current: HTMLElement | null } = { current: null };
  const scrollbarYRef: { current: HTMLElement | null } = { current: null };
  const scrollbarXRef: { current: HTMLElement | null } = { current: null };
  const thumbYRef: { current: HTMLElement | null } = { current: null };
  const thumbXRef: { current: HTMLElement | null } = { current: null };
  const cornerRef: { current: HTMLElement | null } = { current: null };

  let thumbDragging = false;
  let startY = 0;
  let startX = 0;
  let startScrollTop = 0;
  let startScrollLeft = 0;
  let currentOrientation: 'vertical' | 'horizontal' = 'vertical';
  let scrollPosition = DEFAULT_COORDS;

  function handleScroll(nextScrollPosition: Coords) {
    const offsetX = nextScrollPosition.x - scrollPosition.x;
    const offsetY = nextScrollPosition.y - scrollPosition.y;

    scrollPosition = nextScrollPosition;

    if (offsetY !== 0) {
      setScrollingY(true);

      scrollYTimeout.start(SCROLL_TIMEOUT, () => {
        setScrollingY(false);
      });
    }

    if (offsetX !== 0) {
      setScrollingX(true);

      scrollXTimeout.start(SCROLL_TIMEOUT, () => {
        setScrollingX(false);
      });
    }
  }

  function handlePointerDown(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }

    thumbDragging = true;
    startY = event.clientY;
    startX = event.clientX;
    currentOrientation = (event.currentTarget as Element).getAttribute(
      ScrollAreaScrollbarDataAttributes.orientation,
    ) as 'vertical' | 'horizontal';

    if (viewportRef.current) {
      startScrollTop = viewportRef.current.scrollTop;
      startScrollLeft = viewportRef.current.scrollLeft;
    }
    if (thumbYRef.current && currentOrientation === 'vertical') {
      thumbYRef.current.setPointerCapture(event.pointerId);
    }
    if (thumbXRef.current && currentOrientation === 'horizontal') {
      thumbXRef.current.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (!thumbDragging) {
      return;
    }

    const deltaY = event.clientY - startY;
    const deltaX = event.clientX - startX;

    if (viewportRef.current) {
      const scrollableContentHeight = viewportRef.current.scrollHeight;
      const viewportHeight = viewportRef.current.clientHeight;
      const scrollableContentWidth = viewportRef.current.scrollWidth;
      const viewportWidth = viewportRef.current.clientWidth;

      if (
        thumbYRef.current &&
        scrollbarYRef.current &&
        currentOrientation === 'vertical'
      ) {
        const scrollbarYOffset = getOffset(scrollbarYRef.current, 'padding', 'y');
        const thumbYOffset = getOffset(thumbYRef.current, 'margin', 'y');
        const thumbHeight = thumbYRef.current.offsetHeight;
        const maxThumbOffsetY =
          scrollbarYRef.current.offsetHeight - thumbHeight - scrollbarYOffset - thumbYOffset;
        // A short or heavily padded track can drive `maxThumbOffsetY` to zero or
        // negative once the thumb hits its `MIN_THUMB_SIZE` floor. Dividing by it
        // would yield a non-finite (`Infinity`/`NaN`) or inverted `scrollTop`.
        const scrollRatioY = maxThumbOffsetY <= 0 ? 0 : deltaY / maxThumbOffsetY;

        viewportRef.current.scrollTop =
          startScrollTop + scrollRatioY * (scrollableContentHeight - viewportHeight);
        event.preventDefault();

        setScrollingY(true);

        scrollYTimeout.start(SCROLL_TIMEOUT, () => {
          setScrollingY(false);
        });
      }

      if (
        thumbXRef.current &&
        scrollbarXRef.current &&
        currentOrientation === 'horizontal'
      ) {
        const scrollbarXOffset = getOffset(scrollbarXRef.current, 'padding', 'x');
        const thumbXOffset = getOffset(thumbXRef.current, 'margin', 'x');
        const thumbWidth = thumbXRef.current.offsetWidth;
        const maxThumbOffsetX =
          scrollbarXRef.current.offsetWidth - thumbWidth - scrollbarXOffset - thumbXOffset;
        // See the vertical case: guard against a non-positive offset.
        const scrollRatioX = maxThumbOffsetX <= 0 ? 0 : deltaX / maxThumbOffsetX;

        viewportRef.current.scrollLeft =
          startScrollLeft + scrollRatioX * (scrollableContentWidth - viewportWidth);
        event.preventDefault();

        setScrollingX(true);

        scrollXTimeout.start(SCROLL_TIMEOUT, () => {
          setScrollingX(false);
        });
      }
    }
  }

  function handlePointerUp(event: PointerEvent) {
    thumbDragging = false;

    // `pointercancel` releases capture implicitly, so guard against releasing a
    // capture we no longer hold (which would throw).
    if (
      thumbYRef.current &&
      currentOrientation === 'vertical' &&
      thumbYRef.current.hasPointerCapture(event.pointerId)
    ) {
      thumbYRef.current.releasePointerCapture(event.pointerId);
    }
    if (
      thumbXRef.current &&
      currentOrientation === 'horizontal' &&
      thumbXRef.current.hasPointerCapture(event.pointerId)
    ) {
      thumbXRef.current.releasePointerCapture(event.pointerId);
    }
  }

  function handleTouchModalityChange(event: PointerEvent) {
    setTouchModality(event.pointerType === 'touch');
  }

  function handlePointerEnterOrMove(event: PointerEvent) {
    handleTouchModalityChange(event);

    if (event.pointerType !== 'touch') {
      const isTargetRootChild = contains(rootRef.current, event.target as Element | null);
      setHovering(isTargetRootChild);
    }
  }

  const state: ScrollAreaRoot.State = {
    get scrolling() {
      return scrollingX() || scrollingY();
    },
    get hasOverflowX() {
      return !hiddenState().x;
    },
    get hasOverflowY() {
      return !hiddenState().y;
    },
    get overflowXStart() {
      return overflowEdges().xStart;
    },
    get overflowXEnd() {
      return overflowEdges().xEnd;
    },
    get overflowYStart() {
      return overflowEdges().yStart;
    },
    get overflowYEnd() {
      return overflowEdges().yEnd;
    },
    get cornerHidden() {
      return hiddenState().corner;
    },
  };

  const contextValue: ScrollAreaRootContextValue = {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleScroll,
    cornerSize,
    setCornerSize,
    thumbSize,
    setThumbSize,
    hasMeasuredScrollbar,
    setHasMeasuredScrollbar,
    touchModality,
    cornerRef,
    scrollingX,
    setScrollingX,
    scrollingY,
    setScrollingY,
    hovering,
    setHovering,
    viewportRef,
    rootRef,
    scrollbarYRef,
    scrollbarXRef,
    thumbYRef,
    thumbXRef,
    rootId,
    hiddenState,
    setHiddenState,
    overflowEdges,
    setOverflowEdges,
    viewportState: state,
    overflowEdgeThreshold,
  };

  return (
    <ScrollAreaRootContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-ScrollArea-Root',
        slot: 'scroll-area-root',
        state,
        ref: (el: HTMLElement) => {
          rootRef.current = el;
        },
        props: [
          () => ({
            role: 'presentation',
            onPointerEnter: handlePointerEnterOrMove,
            onPointerMove: handlePointerEnterOrMove,
            onPointerDown: handleTouchModalityChange,
            onPointerLeave: () => setHovering(false),
            style: {
              position: 'relative',
              [ScrollAreaRootCssVars.scrollAreaCornerHeight]: `${cornerSize().height}px`,
              [ScrollAreaRootCssVars.scrollAreaCornerWidth]: `${cornerSize().width}px`,
            },
          }),
          elementProps as HTMLProps,
        ],
        stateAttributesMapping: scrollAreaStateAttributesMapping,
      })}
    </ScrollAreaRootContext.Provider>
  );
}

export interface ScrollAreaRootState {
  /**
   * Whether the scroll area is being scrolled.
   */
  scrolling: boolean;
  /**
   * Whether horizontal overflow is present.
   */
  hasOverflowX: boolean;
  /**
   * Whether vertical overflow is present.
   */
  hasOverflowY: boolean;
  /**
   * Whether there is overflow on the inline start side for the horizontal axis.
   */
  overflowXStart: boolean;
  /**
   * Whether there is overflow on the inline end side for the horizontal axis.
   */
  overflowXEnd: boolean;
  /**
   * Whether there is overflow on the block start side.
   */
  overflowYStart: boolean;
  /**
   * Whether there is overflow on the block end side.
   */
  overflowYEnd: boolean;
  /**
   * Whether the scrollbar corner is hidden.
   */
  cornerHidden: boolean;
}

export interface ScrollAreaRootProps extends BaseUIComponentProps<'div', ScrollAreaRootState> {
  /**
   * The threshold in pixels that must be passed before the overflow edge attributes are applied.
   * Accepts a single number for all edges or an object to configure them individually.
   * @default 0
   */
  overflowEdgeThreshold?:
    | number
    | Partial<{
        xStart: number;
        xEnd: number;
        yStart: number;
        yEnd: number;
      }>
    | undefined;
}

export namespace ScrollAreaRoot {
  export type State = ScrollAreaRootState;
  export type Props = ScrollAreaRootProps;
}
