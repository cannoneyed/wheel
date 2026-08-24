/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, createSignal, type Accessor } from 'solid-js';
import { EMPTY_ARRAY } from '../../../base-utils/empty';
import type { TextDirection } from '../../direction-context/DirectionContext';
import {
  ARROW_DOWN,
  ARROW_KEYS,
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
  COMPOSITE_KEYS,
  END,
  HOME,
  HORIZONTAL_KEYS,
  HORIZONTAL_KEYS_WITH_EXTRA_KEYS,
  MODIFIER_KEYS,
  VERTICAL_KEYS,
  VERTICAL_KEYS_WITH_EXTRA_KEYS,
  findNonDisabledListIndex,
  getMaxListIndex,
  getMinListIndex,
  getTarget,
  isElementDisabled,
  isIndexOutOfListBounds,
  isListIndexDisabled,
  isNativeInput,
  scrollIntoViewIfNeeded,
  type ModifierKey,
} from '../composite';
import { ACTIVE_COMPOSITE_ITEM } from '../constants';
import type { CompositeMetadata } from '../list/CompositeList';
import type { HTMLProps } from '../../types';
import type { CompositeGridNavigator } from './gridNavigation';

export interface CreateCompositeRootParameters {
  orientation?: Accessor<'horizontal' | 'vertical' | 'both' | undefined> | undefined;
  grid?: Accessor<CompositeGridNavigator | undefined> | undefined;
  loopFocus?: Accessor<boolean | undefined> | undefined;
  onLoop?:
    | ((
        event: KeyboardEvent,
        prevIndex: number,
        nextIndex: number,
        elements: Array<HTMLElement | null>,
      ) => number)
    | undefined;
  highlightedIndex?: Accessor<number | undefined> | undefined;
  onHighlightedIndexChange?: ((index: number) => void) | undefined;
  direction: Accessor<TextDirection>;
  rootRef?: ((el: HTMLElement | null) => void) | undefined;
  /**
   * When `true`, pressing the Home key moves focus to the first item,
   * and pressing the End key moves focus to the last item.
   * @default false
   */
  enableHomeAndEndKeys?: Accessor<boolean | undefined> | undefined;
  /**
   * When `true`, keypress events on Composite's navigation keys
   * be stopped with event.stopPropagation().
   * @default false
   */
  stopEventPropagation?: Accessor<boolean | undefined> | undefined;
  /**
   * Array of item indices to be considered disabled.
   * Used for composite items that are focusable when disabled.
   */
  disabledIndices?: Accessor<number[] | undefined> | undefined;
  /**
   * Array of modifier key values that should allow normal keyboard actions
   * when pressed. By default, all modifier keys prevent normal actions.
   * @default []
   */
  modifierKeys?: Accessor<ModifierKey[] | undefined> | undefined;
  /**
   * Mutable, index-ordered list of registered elements, shared with
   * `CompositeList`. Owned by the caller.
   */
  elements: Array<HTMLElement | null>;
}

export interface CreateCompositeRootReturnValue {
  /** Reactive thunk producing the root's element props. */
  props: () => HTMLProps;
  highlightedIndex: Accessor<number>;
  onHighlightedIndexChange: (index: number, shouldScrollIntoView?: boolean) => void;
  onMapChange: (map: Map<Element, CompositeMetadata<any>>) => void;
  relayKeyboardEvent: (event: KeyboardEvent) => void;
  /** Ref callback that must be attached to the root element. */
  rootRef: (el: HTMLElement | null) => void;
}

/**
 * Solid port of upstream's `useCompositeRoot`.
 */
export function createCompositeRoot(
  parameters: CreateCompositeRootParameters,
): CreateCompositeRootReturnValue {
  const loopFocus = () => parameters.loopFocus?.() ?? true;
  const orientation = () => parameters.orientation?.() ?? 'both';
  const enableHomeAndEndKeys = () => parameters.enableHomeAndEndKeys?.() ?? false;
  const stopEventPropagation = () => parameters.stopEventPropagation?.() ?? false;
  const modifierKeys = () => parameters.modifierKeys?.() ?? (EMPTY_ARRAY as ModifierKey[]);
  const disabledIndices = () => parameters.disabledIndices?.();
  const elements = parameters.elements;

  const [internalHighlightedIndex, internalSetHighlightedIndex] = createSignal(0);

  let rootElement: HTMLElement | null = null;
  const [hasSetDefaultIndex, setHasSetDefaultIndex] = createSignal(false);

  const highlightedIndex: Accessor<number> = () =>
    parameters.highlightedIndex?.() ?? internalHighlightedIndex();

  const onHighlightedIndexChange = (index: number, shouldScrollIntoView = false) => {
    (parameters.onHighlightedIndexChange ?? internalSetHighlightedIndex)(index);
    if (shouldScrollIntoView) {
      const newActiveItem = elements[index];
      scrollIntoViewIfNeeded(rootElement, newActiveItem, parameters.direction(), orientation());
    }
  };

  const onMapChange = (map: Map<Element, CompositeMetadata<any>>) => {
    if (map.size === 0 || hasSetDefaultIndex()) {
      return;
    }
    setHasSetDefaultIndex(true);
    const sortedElements = Array.from(map.keys()) as Array<HTMLElement | null>;
    const activeItem =
      sortedElements.find((compositeElement) =>
        compositeElement?.hasAttribute(ACTIVE_COMPOSITE_ITEM),
      ) ?? null;
    // Set the default highlighted index of an arbitrary composite item.
    const activeIndex = activeItem ? sortedElements.indexOf(activeItem) : -1;

    if (activeIndex !== -1) {
      onHighlightedIndexChange(activeIndex);
    } else if (isListIndexDisabled(sortedElements, highlightedIndex(), disabledIndices())) {
      // The default highlighted item is disabled, so it should not hold the single
      // roving tab stop: a natively disabled element is removed from the tab order,
      // and an aria-disabled one should not be the entry point. Move the tab stop
      // to the first enabled item. If every item is disabled, keep the current
      // highlighted index.
      const firstEnabledIndex = findNonDisabledListIndex(sortedElements, {
        disabledIndices: disabledIndices(),
      });
      if (!isIndexOutOfListBounds(sortedElements, firstEnabledIndex)) {
        onHighlightedIndexChange(firstEnabledIndex);
      }
    }

    scrollIntoViewIfNeeded(rootElement, activeItem, parameters.direction(), orientation());
  };

  // `disabledIndices` can resolve after the initial map population (e.g. Toolbar
  // derives it from item metadata through a state update), so the default tab
  // stop at index 0 may now point at a disabled item, leaving the composite
  // without a reachable tab stop. Re-validate and move it to the first enabled
  // item. Gated on `disabledIndices` being provided so composites that rely on
  // the DOM disabled fallback keep their existing behavior.
  createEffect(() => {
    const currentDisabledIndices = disabledIndices();
    if (
      currentDisabledIndices == null ||
      parameters.highlightedIndex?.() != null ||
      !hasSetDefaultIndex()
    ) {
      return;
    }
    if (isListIndexDisabled(elements, highlightedIndex(), currentDisabledIndices)) {
      const firstEnabledIndex = findNonDisabledListIndex(elements, {
        disabledIndices: currentDisabledIndices,
      });
      if (!isIndexOutOfListBounds(elements, firstEnabledIndex)) {
        onHighlightedIndexChange(firstEnabledIndex);
      }
    }
  });

  const wrappedOnLoop = (event: KeyboardEvent, prevIndex: number, nextIndex: number) => {
    if (!parameters.onLoop) {
      return nextIndex;
    }
    return parameters.onLoop(event, prevIndex, nextIndex, elements);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const homeAndEnd = enableHomeAndEndKeys();
    const RELEVANT_KEYS = homeAndEnd ? COMPOSITE_KEYS : ARROW_KEYS;
    if (!RELEVANT_KEYS.has(event.key)) {
      return;
    }

    if (isModifierKeySet(event, modifierKeys())) {
      return;
    }

    const element = rootElement;
    if (!element) {
      return;
    }

    const isRtl = parameters.direction() === 'rtl';
    const currentOrientation = orientation();

    const horizontalForwardKey = isRtl ? ARROW_LEFT : ARROW_RIGHT;
    const forwardKey = {
      horizontal: horizontalForwardKey,
      vertical: ARROW_DOWN,
      both: horizontalForwardKey,
    }[currentOrientation];
    const horizontalBackwardKey = isRtl ? ARROW_RIGHT : ARROW_LEFT;
    const backwardKey = {
      horizontal: horizontalBackwardKey,
      vertical: ARROW_UP,
      both: horizontalBackwardKey,
    }[currentOrientation];

    const target = getTarget(event);
    if (target != null && isNativeInput(target) && !isElementDisabled(target as HTMLElement)) {
      const inputTarget = target as HTMLInputElement | HTMLTextAreaElement;
      const selectionStart = inputTarget.selectionStart;
      const selectionEnd = inputTarget.selectionEnd;
      const textContent = inputTarget.value ?? '';
      // return to native textbox behavior when
      // 1 - Shift is held to make a text selection, or if there already is a text selection
      if (selectionStart == null || event.shiftKey || selectionStart !== selectionEnd) {
        return;
      }
      // 2 - arrow-ing forward and not in the last position of the text
      if (event.key !== backwardKey && selectionStart < textContent.length) {
        return;
      }
      // 3 -arrow-ing backward and not in the first position of the text
      if (event.key !== forwardKey && selectionStart > 0) {
        return;
      }
    }

    const startHighlightedIndex = highlightedIndex();
    let nextIndex = startHighlightedIndex;
    const currentDisabledIndices = disabledIndices();
    const minIndex = getMinListIndex(elements, currentDisabledIndices);
    const maxIndex = getMaxListIndex(elements, currentDisabledIndices);

    const grid = parameters.grid?.();
    const isGrid = grid != null;
    const currentLoopFocus = loopFocus();

    if (grid != null) {
      nextIndex = grid({
        disabledIndices: currentDisabledIndices,
        elements,
        event,
        highlightedIndex: startHighlightedIndex,
        loopFocus: currentLoopFocus,
        maxIndex,
        minIndex,
        onLoop: wrappedOnLoop,
        orientation: currentOrientation,
        rtl: isRtl,
      });
    }

    const forwardKeys = {
      horizontal: [horizontalForwardKey],
      vertical: [ARROW_DOWN],
      both: [horizontalForwardKey, ARROW_DOWN],
    }[currentOrientation];

    const backwardKeys = {
      horizontal: [horizontalBackwardKey],
      vertical: [ARROW_UP],
      both: [horizontalBackwardKey, ARROW_UP],
    }[currentOrientation];

    const preventedKeys = isGrid
      ? RELEVANT_KEYS
      : {
          horizontal: homeAndEnd ? HORIZONTAL_KEYS_WITH_EXTRA_KEYS : HORIZONTAL_KEYS,
          vertical: homeAndEnd ? VERTICAL_KEYS_WITH_EXTRA_KEYS : VERTICAL_KEYS,
          both: RELEVANT_KEYS,
        }[currentOrientation];

    if (homeAndEnd) {
      if (event.key === HOME) {
        nextIndex = minIndex;
      } else if (event.key === END) {
        nextIndex = maxIndex;
      }
    }

    if (
      nextIndex === startHighlightedIndex &&
      (forwardKeys.includes(event.key) || backwardKeys.includes(event.key))
    ) {
      if (currentLoopFocus && nextIndex === maxIndex && forwardKeys.includes(event.key)) {
        nextIndex = minIndex;
        if (parameters.onLoop) {
          nextIndex = parameters.onLoop(event, startHighlightedIndex, nextIndex, elements);
        }
      } else if (currentLoopFocus && nextIndex === minIndex && backwardKeys.includes(event.key)) {
        nextIndex = maxIndex;
        if (parameters.onLoop) {
          nextIndex = parameters.onLoop(event, startHighlightedIndex, nextIndex, elements);
        }
      } else {
        nextIndex = findNonDisabledListIndex(elements, {
          startingIndex: nextIndex,
          decrement: backwardKeys.includes(event.key),
          disabledIndices: currentDisabledIndices,
        });
      }
    }

    if (nextIndex !== startHighlightedIndex && !isIndexOutOfListBounds(elements, nextIndex)) {
      if (stopEventPropagation()) {
        event.stopPropagation();
      }

      if (preventedKeys.has(event.key)) {
        event.preventDefault();
      }
      onHighlightedIndexChange(nextIndex, true);

      // Wait for FocusManager `returnFocus` to execute.
      queueMicrotask(() => {
        elements[nextIndex]?.focus();
      });
    }
  };

  const props = (): HTMLProps => ({
    // `focusin` (bubbling), not `focus`: upstream's React `onFocus` is synthetic and
    // bubbles; Solid's `onFocus` only fires on the root element itself, which would
    // break select-all when focus lands on a descendant input via arrow-key navigation.
    onFocusIn(event: FocusEvent) {
      const element = rootElement;
      const target = getTarget(event);
      if (!element || target == null || !isNativeInput(target)) {
        return;
      }
      const inputTarget = target as HTMLInputElement | HTMLTextAreaElement;
      inputTarget.setSelectionRange(0, inputTarget.value.length ?? 0);
    },
    onKeyDown,
  });

  const rootRef = (el: HTMLElement | null) => {
    rootElement = el;
    parameters.rootRef?.(el);
  };

  return {
    props,
    highlightedIndex,
    onHighlightedIndexChange,
    onMapChange,
    relayKeyboardEvent: onKeyDown,
    rootRef,
  };
}

function isModifierKeySet(event: KeyboardEvent, ignoredModifierKeys: ModifierKey[]) {
  for (const key of MODIFIER_KEYS.values()) {
    if (ignoredModifierKeys.includes(key)) {
      continue;
    }
    if (event.getModifierState(key)) {
      return true;
    }
  }
  return false;
}
