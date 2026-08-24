/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { isHTMLElement, getComputedStyle } from '@floating-ui/utils/dom';
import type { TextDirection } from '../direction-context/DirectionContext';
import {
  findNonDisabledListIndex,
  isDifferentGridRow,
  isElementVisible,
  isHiddenByStyles,
  isIndexOutOfListBounds,
  isListIndexDisabled,
  type DisabledIndices,
} from '../../floating-ui-solid/utils/composite';

// Re-exported so existing internal consumers (`createCompositeRoot.ts`,
// `gridNavigation.ts`, `index.ts`) can keep importing these list-index
// algorithms from this module — the actual implementations live in the
// canonical `floating-ui-solid/utils/composite.ts` (shared with
// `useListNavigation`) and are not duplicated here.
export {
  findNonDisabledListIndex,
  isDifferentGridRow,
  isElementVisible,
  isHiddenByStyles,
  isIndexOutOfListBounds,
  isListIndexDisabled,
  type DisabledIndices,
};

// -----------------------------------------------------------------------------
// Keys
// -----------------------------------------------------------------------------

export const ARROW_UP = 'ArrowUp';
export const ARROW_DOWN = 'ArrowDown';
export const ARROW_LEFT = 'ArrowLeft';
export const ARROW_RIGHT = 'ArrowRight';
export const HOME = 'Home';
export const END = 'End';
export const PAGE_UP = 'PageUp';
export const PAGE_DOWN = 'PageDown';

export const HORIZONTAL_KEYS = new Set([ARROW_LEFT, ARROW_RIGHT]);
export const HORIZONTAL_KEYS_WITH_EXTRA_KEYS = new Set([ARROW_LEFT, ARROW_RIGHT, HOME, END]);
export const VERTICAL_KEYS = new Set([ARROW_UP, ARROW_DOWN]);
export const VERTICAL_KEYS_WITH_EXTRA_KEYS = new Set([ARROW_UP, ARROW_DOWN, HOME, END]);
export const ARROW_KEYS = new Set([...HORIZONTAL_KEYS, ...VERTICAL_KEYS]);
export const COMPOSITE_KEYS = new Set([...ARROW_KEYS, HOME, END]);

export const SHIFT = 'Shift' as const;
export const CONTROL = 'Control' as const;
export const ALT = 'Alt' as const;
export const META = 'Meta' as const;
export const MODIFIER_KEYS = new Set([SHIFT, CONTROL, ALT, META] as const);
export type ModifierKey = typeof MODIFIER_KEYS extends Set<infer Keys> ? Keys : never;

function isInputElement(element: EventTarget): element is HTMLInputElement {
  return isHTMLElement(element) && element.tagName === 'INPUT';
}

export function isNativeInput(
  element: EventTarget,
): element is HTMLElement & (HTMLInputElement | HTMLTextAreaElement) {
  if (isInputElement(element) && element.selectionStart != null) {
    return true;
  }
  if (isHTMLElement(element) && element.tagName === 'TEXTAREA') {
    return true;
  }
  return false;
}

export function scrollIntoViewIfNeeded(
  scrollContainer: HTMLElement | null,
  element: HTMLElement | null,
  direction: TextDirection,
  orientation: 'horizontal' | 'vertical' | 'both',
) {
  if (!scrollContainer || !element || !element.scrollTo) {
    return;
  }

  let targetX = scrollContainer.scrollLeft;
  let targetY = scrollContainer.scrollTop;

  const isOverflowingX = scrollContainer.clientWidth < scrollContainer.scrollWidth;
  const isOverflowingY = scrollContainer.clientHeight < scrollContainer.scrollHeight;

  if (isOverflowingX && orientation !== 'vertical') {
    const elementOffsetLeft = getOffset(scrollContainer, element, 'left');
    const containerStyles = getStyles(scrollContainer);
    const elementStyles = getStyles(element);

    if (direction === 'ltr') {
      if (
        elementOffsetLeft + element.offsetWidth + elementStyles.scrollMarginRight >
        scrollContainer.scrollLeft +
          scrollContainer.clientWidth -
          containerStyles.scrollPaddingRight
      ) {
        // overflow to the right, scroll to align right edges
        targetX =
          elementOffsetLeft +
          element.offsetWidth +
          elementStyles.scrollMarginRight -
          scrollContainer.clientWidth +
          containerStyles.scrollPaddingRight;
      } else if (
        elementOffsetLeft - elementStyles.scrollMarginLeft <
        scrollContainer.scrollLeft + containerStyles.scrollPaddingLeft
      ) {
        // overflow to the left, scroll to align left edges
        targetX =
          elementOffsetLeft - elementStyles.scrollMarginLeft - containerStyles.scrollPaddingLeft;
      }
    }

    if (direction === 'rtl') {
      if (
        elementOffsetLeft - elementStyles.scrollMarginRight <
        scrollContainer.scrollLeft + containerStyles.scrollPaddingLeft
      ) {
        // overflow to the left, scroll to align left edges
        targetX =
          elementOffsetLeft - elementStyles.scrollMarginLeft - containerStyles.scrollPaddingLeft;
      } else if (
        elementOffsetLeft + element.offsetWidth + elementStyles.scrollMarginRight >
        scrollContainer.scrollLeft +
          scrollContainer.clientWidth -
          containerStyles.scrollPaddingRight
      ) {
        // overflow to the right, scroll to align right edges
        targetX =
          elementOffsetLeft +
          element.offsetWidth +
          elementStyles.scrollMarginRight -
          scrollContainer.clientWidth +
          containerStyles.scrollPaddingRight;
      }
    }
  }

  if (isOverflowingY && orientation !== 'horizontal') {
    const elementOffsetTop = getOffset(scrollContainer, element, 'top');
    const containerStyles = getStyles(scrollContainer);
    const elementStyles = getStyles(element);

    if (
      elementOffsetTop - elementStyles.scrollMarginTop <
      scrollContainer.scrollTop + containerStyles.scrollPaddingTop
    ) {
      // overflow upwards, align top edges
      targetY = elementOffsetTop - elementStyles.scrollMarginTop - containerStyles.scrollPaddingTop;
    } else if (
      elementOffsetTop + element.offsetHeight + elementStyles.scrollMarginBottom >
      scrollContainer.scrollTop + scrollContainer.clientHeight - containerStyles.scrollPaddingBottom
    ) {
      // overflow downwards, align bottom edges
      targetY =
        elementOffsetTop +
        element.offsetHeight +
        elementStyles.scrollMarginBottom -
        scrollContainer.clientHeight +
        containerStyles.scrollPaddingBottom;
    }
  }

  scrollContainer.scrollTo({
    left: targetX,
    top: targetY,
    behavior: 'auto',
  });
}

function getOffset(ancestor: HTMLElement, element: HTMLElement, side: 'left' | 'top') {
  const propName = side === 'left' ? 'offsetLeft' : 'offsetTop';

  let result = 0;

  while (element.offsetParent) {
    result += element[propName];
    if (element.offsetParent === ancestor) {
      break;
    }
    element = element.offsetParent as HTMLElement;
  }

  return result;
}

function getStyles(element: HTMLElement) {
  const styles = getComputedStyle(element);
  return {
    scrollMarginTop: parseFloat(styles.scrollMarginTop) || 0,
    scrollMarginRight: parseFloat(styles.scrollMarginRight) || 0,
    scrollMarginBottom: parseFloat(styles.scrollMarginBottom) || 0,
    scrollMarginLeft: parseFloat(styles.scrollMarginLeft) || 0,
    scrollPaddingTop: parseFloat(styles.scrollPaddingTop) || 0,
    scrollPaddingRight: parseFloat(styles.scrollPaddingRight) || 0,
    scrollPaddingBottom: parseFloat(styles.scrollPaddingBottom) || 0,
    scrollPaddingLeft: parseFloat(styles.scrollPaddingLeft) || 0,
  };
}

// -----------------------------------------------------------------------------
// List-index utilities.
//
// The core algorithms (`findNonDisabledListIndex`, `isListIndexDisabled`,
// `isElementVisible`, etc.) live in the canonical
// `floating-ui-solid/utils/composite.ts` (shared with `useListNavigation`) and
// are imported/re-exported above rather than duplicated here.
// -----------------------------------------------------------------------------

// Divergent from canonical: `floating-ui-solid/utils/composite.ts`'s
// `getMinListIndex`/`getMaxListIndex` take a `{ current: list }` ref-object
// (matching `useListNavigation`'s `listRef` convention). The composite root's
// own `createCompositeRoot`/`gridNavigation` bookkeeping uses plain arrays
// throughout instead, so these thin wrappers keep that signature while
// delegating to the shared `findNonDisabledListIndex` algorithm.
export function getMinListIndex(
  list: ReadonlyArray<HTMLElement | null>,
  disabledIndices?: DisabledIndices | undefined,
) {
  return findNonDisabledListIndex(list, { disabledIndices });
}

export function getMaxListIndex(
  list: ReadonlyArray<HTMLElement | null>,
  disabledIndices?: DisabledIndices | undefined,
) {
  return findNonDisabledListIndex(list, {
    decrement: true,
    startingIndex: list.length,
    disabledIndices,
  });
}

export function isElementDisabled(element: HTMLElement | null) {
  return (
    element == null ||
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true'
  );
}

export function stopEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}

export function getTarget(event: Event): EventTarget | null {
  if ('composedPath' in event) {
    return event.composedPath()[0] ?? null;
  }
  // TS thinks `event` is of type `never` here (it assumes all environments
  // support `composedPath`), but older environments without shadow DOM
  // support still fall back to `target`.
  return (event as Event).target;
}
