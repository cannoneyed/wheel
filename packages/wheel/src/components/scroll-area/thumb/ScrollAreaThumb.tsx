/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { useScrollAreaRootContext } from '../root/ScrollAreaRootContext';
import { useScrollAreaScrollbarContext } from '../scrollbar/ScrollAreaScrollbarContext';
import { ScrollAreaScrollbarCssVars } from '../scrollbar/ScrollAreaScrollbarCssVars';

/**
 * The draggable part of the scrollbar that indicates the current scroll position.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Scroll Area](https://base-ui.com/react/components/scroll-area)
 */
export function ScrollAreaThumb(componentProps: ScrollAreaThumb.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const {
    thumbYRef,
    thumbXRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    setScrollingX,
    setScrollingY,
    scrollingX,
    scrollingY,
    hasMeasuredScrollbar,
  } = useScrollAreaRootContext();

  const { orientation } = useScrollAreaScrollbarContext();

  const state: ScrollAreaThumb.State = {
    get scrolling() {
      return orientation() === 'horizontal' ? scrollingX() : scrollingY();
    },
    get orientation() {
      return orientation();
    },
  };

  function endDrag(event: PointerEvent) {
    if (orientation() === 'vertical') {
      setScrollingY(false);
    }
    if (orientation() === 'horizontal') {
      setScrollingX(false);
    }
    handlePointerUp(event);
  }

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-ScrollArea-Thumb',
    slot: 'scroll-area-thumb',
    state,
    ref:
      orientation() === 'vertical'
        ? (el: HTMLElement) => {
            thumbYRef.current = el;
          }
        : (el: HTMLElement) => {
            thumbXRef.current = el;
          },
    props: [
      () => ({
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        style: {
          visibility: hasMeasuredScrollbar() ? undefined : 'hidden',
          ...(orientation() === 'vertical'
            ? { height: `var(${ScrollAreaScrollbarCssVars.scrollAreaThumbHeight})` }
            : {}),
          ...(orientation() === 'horizontal'
            ? { width: `var(${ScrollAreaScrollbarCssVars.scrollAreaThumbWidth})` }
            : {}),
        },
      }),
      elementProps as HTMLProps,
    ],
  });
}

export interface ScrollAreaThumbState {
  /**
   * Whether the scroll area is being scrolled.
   */
  scrolling: boolean;
  /**
   * The component orientation.
   */
  orientation: 'horizontal' | 'vertical';
}

export interface ScrollAreaThumbProps extends BaseUIComponentProps<'div', ScrollAreaThumbState> {}

export namespace ScrollAreaThumb {
  export type State = ScrollAreaThumbState;
  export type Props = ScrollAreaThumbProps;
}
