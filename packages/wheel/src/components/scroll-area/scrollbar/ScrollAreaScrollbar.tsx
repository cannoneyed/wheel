/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import { addEventListener } from '../../base-utils/addEventListener';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { contains, getTarget } from '../../internals/shadowDom';
import { useDirection } from '../../internals/direction-context/DirectionContext';
import { useScrollAreaRootContext } from '../root/ScrollAreaRootContext';
import { scrollAreaStateAttributesMapping } from '../root/stateAttributesMapping';
import type { ScrollAreaRootState } from '../root/ScrollAreaRoot';
import { ScrollAreaRootCssVars } from '../root/ScrollAreaRootCssVars';
import { getOffset } from '../utils/getOffset';
import { ScrollAreaScrollbarCssVars } from './ScrollAreaScrollbarCssVars';
import {
  ScrollAreaScrollbarContext,
  type ScrollAreaScrollbarContextValue,
} from './ScrollAreaScrollbarContext';

/**
 * A vertical or horizontal scrollbar for the scroll area.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Scroll Area](https://base-ui.com/react/components/scroll-area)
 */
export function ScrollAreaScrollbar(componentProps: ScrollAreaScrollbar.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'orientation',
    'keepMounted',
  ]);

  const {
    hovering,
    scrollingX,
    scrollingY,
    hiddenState,
    overflowEdges,
    scrollbarYRef,
    scrollbarXRef,
    viewportRef,
    thumbYRef,
    thumbXRef,
    handlePointerDown,
    handlePointerUp,
    handleScroll,
    rootId,
    thumbSize,
    hasMeasuredScrollbar,
  } = useScrollAreaRootContext();

  const orientation = () => componentProps.orientation ?? 'vertical';
  const keepMounted = () => componentProps.keepMounted ?? false;

  const direction = useDirection();

  const state: ScrollAreaScrollbar.State = {
    get hovering() {
      return hovering();
    },
    get scrolling() {
      return orientation() === 'horizontal' ? scrollingX() : scrollingY();
    },
    get orientation() {
      return orientation();
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

  const hideTrackUntilMeasured = () => !hasMeasuredScrollbar() && !keepMounted();
  const isHidden = () => (orientation() === 'vertical' ? hiddenState().y : hiddenState().x);
  const shouldRender = () => keepMounted() || !isHidden();

  createEffect(() => {
    // Read the tracked signals synchronously so the effect re-runs (and re-attaches the
    // listener) when any of them change, matching upstream's `useEffect` dependency array.
    if (!shouldRender()) {
      return;
    }

    const orientationValue = orientation();
    const directionValue = direction();

    const viewportEl = viewportRef.current;
    const scrollbarEl = orientationValue === 'vertical' ? scrollbarYRef.current : scrollbarXRef.current;

    if (!scrollbarEl) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      if (!viewportEl || !scrollbarEl || event.ctrlKey) {
        return;
      }

      const horizontal = orientationValue === 'horizontal';
      const scrollProperty = horizontal ? 'scrollLeft' : 'scrollTop';
      const delta = horizontal ? event.deltaX : event.deltaY;
      if (delta === 0) {
        return;
      }

      const maxScroll = horizontal
        ? viewportEl.scrollWidth - viewportEl.clientWidth
        : viewportEl.scrollHeight - viewportEl.clientHeight;
      // RTL horizontal scrolling uses a negative `scrollLeft` range, from 0 to `-maxScroll`.
      const minScroll = horizontal && directionValue === 'rtl' ? -maxScroll : 0;
      const maxScrollValue = horizontal && directionValue === 'rtl' ? 0 : maxScroll;
      const scrollValue = viewportEl[scrollProperty];

      // At an edge (or with no overflow), let the wheel event chain to the
      // parent/page instead of swallowing it via `preventDefault`.
      if ((scrollValue <= minScroll && delta < 0) || (scrollValue >= maxScrollValue && delta > 0)) {
        return;
      }

      event.preventDefault();

      viewportEl[scrollProperty] = Math.min(maxScrollValue, Math.max(minScroll, scrollValue + delta));

      handleScroll({ x: viewportEl.scrollLeft, y: viewportEl.scrollTop });
    }

    const dispose = addEventListener(scrollbarEl, 'wheel', handleWheel, { passive: false });
    onCleanup(dispose);
  });

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }

    const target = getTarget(event) as Element | null;
    const orientationValue = orientation();
    const thumb = orientationValue === 'vertical' ? thumbYRef.current : thumbXRef.current;

    // Ignore clicks on thumb, including cases where the event is retargeted to the
    // track host across a shadow boundary.
    if (thumb && contains(thumb, target)) {
      return;
    }

    if (!viewportRef.current) {
      return;
    }

    // Handle Y-axis (vertical) scroll
    if (thumbYRef.current && scrollbarYRef.current && orientationValue === 'vertical') {
      const thumbYOffset = getOffset(thumbYRef.current, 'margin', 'y');
      const scrollbarYOffset = getOffset(scrollbarYRef.current, 'padding', 'y');
      const thumbHeight = thumbYRef.current.offsetHeight;
      const trackRectY = scrollbarYRef.current.getBoundingClientRect();
      const clickY =
        event.clientY - trackRectY.top - thumbHeight / 2 - scrollbarYOffset + thumbYOffset / 2;

      const scrollableContentHeight = viewportRef.current.scrollHeight;
      const viewportHeight = viewportRef.current.clientHeight;

      const maxThumbOffsetY =
        scrollbarYRef.current.offsetHeight - thumbHeight - scrollbarYOffset - thumbYOffset;
      // A short or heavily padded track can drive `maxThumbOffsetY` to zero or
      // negative once the thumb hits its `MIN_THUMB_SIZE` floor. Dividing by it
      // would yield a non-finite (`Infinity`/`NaN`) or inverted `scrollTop`.
      if (maxThumbOffsetY <= 0) {
        return;
      }

      const scrollRatioY = clickY / maxThumbOffsetY;
      const newScrollTop = scrollRatioY * (scrollableContentHeight - viewportHeight);

      viewportRef.current.scrollTop = newScrollTop;
    }

    if (thumbXRef.current && scrollbarXRef.current && orientationValue === 'horizontal') {
      const thumbXOffset = getOffset(thumbXRef.current, 'margin', 'x');
      const scrollbarXOffset = getOffset(scrollbarXRef.current, 'padding', 'x');
      const thumbWidth = thumbXRef.current.offsetWidth;
      const trackRectX = scrollbarXRef.current.getBoundingClientRect();
      const clickX =
        event.clientX - trackRectX.left - thumbWidth / 2 - scrollbarXOffset + thumbXOffset / 2;

      const scrollableContentWidth = viewportRef.current.scrollWidth;
      const viewportWidth = viewportRef.current.clientWidth;

      const maxThumbOffsetX =
        scrollbarXRef.current.offsetWidth - thumbWidth - scrollbarXOffset - thumbXOffset;
      // See the vertical case: guard against a non-positive offset.
      if (maxThumbOffsetX <= 0) {
        return;
      }

      const scrollRatioX = clickX / maxThumbOffsetX;

      let newScrollLeft: number;
      if (direction() === 'rtl') {
        // In RTL, invert the scroll direction
        newScrollLeft = (1 - scrollRatioX) * (scrollableContentWidth - viewportWidth);

        // Adjust for browsers that use negative scrollLeft in RTL
        if (viewportRef.current.scrollLeft <= 0) {
          newScrollLeft = -newScrollLeft;
        }
      } else {
        newScrollLeft = scrollRatioX * (scrollableContentWidth - viewportWidth);
      }

      viewportRef.current.scrollLeft = newScrollLeft;
    }

    handleScroll({ x: viewportRef.current.scrollLeft, y: viewportRef.current.scrollTop });

    handlePointerDown(event);
  }

  const contextValue: ScrollAreaScrollbarContextValue = { orientation };

  return (
    <ScrollAreaScrollbarContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-ScrollArea-Scrollbar',
        slot: 'scroll-area-scrollbar',
        state,
        ref:
          orientation() === 'vertical'
            ? (el: HTMLElement) => {
                scrollbarYRef.current = el;
              }
            : (el: HTMLElement) => {
                scrollbarXRef.current = el;
              },
        props: [
          () => ({
            ...(rootId() ? { 'data-id': `${rootId()}-scrollbar` } : {}),
            onPointerDown,
            onPointerUp: handlePointerUp,
            // Mirror `onPointerUp` so a browser-cancelled gesture on the track (no thumb
            // child captures the pointer) still clears the drag state.
            onPointerCancel: handlePointerUp,
            style: {
              position: 'absolute',
              'touch-action': 'none',
              '-webkit-user-select': 'none',
              'user-select': 'none',
              visibility: hideTrackUntilMeasured() ? 'hidden' : undefined,
              ...(orientation() === 'vertical'
                ? {
                    top: '0',
                    bottom: `var(${ScrollAreaRootCssVars.scrollAreaCornerHeight})`,
                    'inset-inline-end': '0',
                    [ScrollAreaScrollbarCssVars.scrollAreaThumbHeight]: `${thumbSize().height}px`,
                  }
                : {}),
              ...(orientation() === 'horizontal'
                ? {
                    'inset-inline-start': '0',
                    'inset-inline-end': `var(${ScrollAreaRootCssVars.scrollAreaCornerWidth})`,
                    bottom: '0',
                    [ScrollAreaScrollbarCssVars.scrollAreaThumbWidth]: `${thumbSize().width}px`,
                  }
                : {}),
            },
          }),
          elementProps as HTMLProps,
        ],
        stateAttributesMapping: scrollAreaStateAttributesMapping,
        enabled: shouldRender,
      })}
    </ScrollAreaScrollbarContext.Provider>
  );
}

export interface ScrollAreaScrollbarState extends ScrollAreaRootState {
  /**
   * Whether the scroll area is being hovered.
   */
  hovering: boolean;
  /**
   * Whether the scroll area is being scrolled.
   */
  scrolling: boolean;
  /**
   * The orientation of the scrollbar.
   */
  orientation: 'vertical' | 'horizontal';
}

export interface ScrollAreaScrollbarProps
  extends BaseUIComponentProps<'div', ScrollAreaScrollbarState> {
  /**
   * Whether the scrollbar controls vertical or horizontal scroll.
   * @default 'vertical'
   */
  orientation?: 'vertical' | 'horizontal' | undefined;
  /**
   * Whether to keep the HTML element in the DOM when the viewport isn't scrollable.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace ScrollAreaScrollbar {
  export type State = ScrollAreaScrollbarState;
  export type Props = ScrollAreaScrollbarProps;
}
