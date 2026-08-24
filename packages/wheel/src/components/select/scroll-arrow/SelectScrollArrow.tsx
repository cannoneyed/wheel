/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { onCleanup, Show, splitProps, type JSX } from 'solid-js';
import { createTimeout } from '../../base-utils/createTimeout';
import { useSelectRootContext } from '../root/SelectRootContext';
import { useSelectPositionerContext } from '../positioner/SelectPositionerContext';
import type { BaseUIComponentProps } from '../../internals/types';
import type { Side } from '../../utils/useAnchorPositioning';
import { createTransitionStatus, type TransitionStatus } from '../../internals/createTransitionStatus';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { renderElement } from '../../internals/renderElement';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import {
  getMaxScrollOffset,
  normalizeScrollOffset,
  SCROLL_EDGE_TOLERANCE_PX,
} from '../../utils/scrollEdges';

/**
 * @internal
 *
 * Deviation: this component's behavior depends entirely on real scroll geometry
 * (`offsetTop`/`offsetHeight`/`scrollTop` on genuinely laid-out elements), which jsdom does not
 * provide (every layout measurement reads back as `0`). Ported faithfully from upstream, but this
 * port's test coverage is limited to structural/attribute assertions (mount/unmount, `data-*`
 * attributes) rather than exercising the actual auto-scroll behavior — matching upstream's own
 * Chromium-only gating for the equivalent tests.
 */
export function SelectScrollArrow(componentProps: SelectScrollArrow.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'direction',
    'keepMounted',
  ]);

  const isUp = () => local.direction === 'up';
  const keepMounted = () => local.keepMounted ?? false;

  const { store, popupRef, listRef, handleScrollArrowVisibility, scrollArrowsMountedCountRef } =
    useSelectRootContext();
  const { side, scrollDownArrowRef, scrollUpArrowRef } = useSelectPositionerContext();

  const stateVisible = store.useState(isUp() ? 'scrollUpArrowVisible' : 'scrollDownArrowVisible');
  const openMethod = store.useState('openMethod');

  // Scroll arrows are disabled for touch modality as they are a hover-only element.
  const visible = () => stateVisible() && openMethod() !== 'touch';

  const timeout = createTimeout();

  const scrollArrowRef = isUp() ? scrollUpArrowRef : scrollDownArrowRef;

  const { mounted, transitionStatus, setMounted } = createTransitionStatus(visible);

  scrollArrowsMountedCountRef.current += 1;
  if (!store.state.hasScrollArrows) {
    store.set('hasScrollArrows', true);
  }

  onCleanup(() => {
    scrollArrowsMountedCountRef.current = Math.max(0, scrollArrowsMountedCountRef.current - 1);
    if (scrollArrowsMountedCountRef.current === 0 && store.state.hasScrollArrows) {
      store.set('hasScrollArrows', false);
    }
  });

  createOpenChangeComplete({
    open: visible,
    getElement: () => scrollArrowRef.current,
    onComplete() {
      if (!visible()) {
        setMounted(false);
      }
    },
  });

  const state: SelectScrollArrow.State = {
    get direction() {
      return local.direction;
    },
    get visible() {
      return visible();
    },
    get side() {
      return side();
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  function scrollNextItem() {
    const scroller = store.state.listElement ?? popupRef.current;
    if (!scroller) {
      return;
    }

    store.set('activeIndex', null);
    handleScrollArrowVisibility();

    const maxScrollTop = getMaxScrollOffset(scroller.scrollHeight, scroller.clientHeight);
    const scrollTop = normalizeScrollOffset(scroller.scrollTop, maxScrollTop);
    const isScrolledToEdge = scrollTop === (isUp() ? 0 : maxScrollTop);
    const items = listRef.current;

    if (scrollTop !== scroller.scrollTop) {
      scroller.scrollTop = scrollTop;
    }

    // Fallback when there are no items registered yet.
    if (items.length === 0) {
      store.set(isUp() ? 'scrollUpArrowVisible' : 'scrollDownArrowVisible', !isScrolledToEdge);
    }

    if (isScrolledToEdge) {
      timeout.clear();
      return;
    }

    if (items.length > 0) {
      const scrollArrowHeight = scrollArrowRef.current?.offsetHeight || 0;
      scroller.scrollTop = getTargetScrollTop(
        items,
        isUp(),
        scrollTop,
        scroller.clientHeight,
        scrollArrowHeight,
        maxScrollTop,
      );
    }

    timeout.start(40, scrollNextItem);
  }

  const defaultProps = () => ({
    'aria-hidden': true,
    style: {
      position: 'absolute',
    },
    onMouseMove(event: MouseEvent) {
      if ((event.movementX === 0 && event.movementY === 0) || timeout.isStarted()) {
        return;
      }

      store.set('activeIndex', null);
      timeout.start(40, scrollNextItem);
    },
    onMouseLeave() {
      timeout.clear();
    },
  });

  const element = renderElement('div', componentProps, {
    defaultClass: () =>
      isUp() ? 'wheel-Select-ScrollUpArrow' : 'wheel-Select-ScrollDownArrow',
    slot: () => (isUp() ? 'select-scroll-up-arrow' : 'select-scroll-down-arrow'),
    ref: (el: HTMLDivElement | null) => {
      scrollArrowRef.current = el;
    },
    state,
    props: [defaultProps, elementProps],
    children: () => (isUp() ? '▲' : '▼'),
    stateAttributesMapping: transitionStatusMapping,
  });

  return <Show when={mounted() || keepMounted()}>{element}</Show>;
}

export interface SelectScrollArrowState {
  /**
   * The direction of the element.
   */
  direction: 'up' | 'down';
  /**
   * Whether the element is visible.
   */
  visible: boolean;
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side | 'none';
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface SelectScrollArrowProps
  extends BaseUIComponentProps<'div', SelectScrollArrowState> {
  direction: 'up' | 'down';
  /**
   * Whether to keep the HTML element in the DOM while the select popup is not scrollable.
   * @default false
   */
  keepMounted?: boolean | undefined;
}

export namespace SelectScrollArrow {
  export type State = SelectScrollArrowState;
  export type Props = SelectScrollArrowProps;
}

function getTargetScrollTop(
  items: Array<HTMLElement | null>,
  isUp: boolean,
  scrollTop: number,
  clientHeight: number,
  scrollArrowHeight: number,
  maxScrollTop: number,
) {
  if (isUp) {
    let firstVisibleIndex = 0;
    const visibleTop = scrollTop + scrollArrowHeight - SCROLL_EDGE_TOLERANCE_PX;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item && item.offsetTop >= visibleTop) {
        firstVisibleIndex = i;
        break;
      }
    }

    const targetIndex = Math.max(0, firstVisibleIndex - 1);
    const targetItem = items[targetIndex];
    return targetIndex < firstVisibleIndex && targetItem
      ? normalizeScrollOffset(targetItem.offsetTop - scrollArrowHeight, maxScrollTop)
      : 0;
  }

  let lastVisibleIndex = items.length - 1;
  const visibleBottom = scrollTop + clientHeight - scrollArrowHeight + SCROLL_EDGE_TOLERANCE_PX;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item && item.offsetTop + item.offsetHeight > visibleBottom) {
      lastVisibleIndex = Math.max(0, i - 1);
      break;
    }
  }

  const targetIndex = Math.min(items.length - 1, lastVisibleIndex + 1);
  const targetItem = items[targetIndex];
  return targetIndex > lastVisibleIndex && targetItem
    ? normalizeScrollOffset(
        targetItem.offsetTop + targetItem.offsetHeight - clientHeight + scrollArrowHeight,
        maxScrollTop,
      )
    : maxScrollTop;
}
