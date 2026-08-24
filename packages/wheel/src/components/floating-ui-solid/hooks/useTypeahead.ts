/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, untrack, type Accessor } from 'solid-js';
import { createTimeout } from '../../base-utils/createTimeout';
import { EMPTY_ARRAY } from '../../base-utils/empty';
import { access, type MaybeAccessor } from '../../internals/types';
import {
  accessDisabledIndices,
  isElementVisible,
  isListIndexDisabled,
  type DisabledIndices,
} from '../utils/composite';
import type { ElementProps, FloatingContext, FloatingRootContext } from '../types';
import { contains } from '../utils/element';
import { stopEvent } from '../utils/event';

export interface UseTypeaheadProps {
  /**
   * A mutable container holding an array of strings whose indices match the
   * HTML elements of the list. Locked convention: plain `{ current }` rather
   * than a React ref object.
   * @default empty list
   */
  listRef: { current: Array<string | null> };
  /**
   * The index of the active (focused or highlighted) item in the list.
   */
  activeIndex: Accessor<number | null>;
  /**
   * Callback invoked with the matching index if found as the user types.
   */
  onMatch?: ((index: number) => void) | undefined;
  /**
   * Optional container of item elements that correspond to `listRef` indices.
   * When an element exists for an index, typeahead skips it if it is hidden by
   * `display: none`, `visibility: hidden|collapse`, or other
   * browser-reported visibility checks.
   */
  elementsRef?: { current: Array<HTMLElement | null> } | undefined;
  /**
   * Indices that are disabled, either as an array or a predicate (the same shape as
   * `useListNavigation`'s `disabledIndices`).
   */
  disabledIndices?: MaybeAccessor<DisabledIndices | undefined>;
  /**
   * Callback invoked with the current typing activity as the user types.
   */
  onTyping?: ((isTyping: boolean) => void) | undefined;
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: MaybeAccessor<boolean | undefined>;
  /**
   * The number of milliseconds to wait before resetting the typed string.
   * @default 750
   */
  resetMs?: MaybeAccessor<number | undefined>;
  /**
   * The index of the selected item in the list, if available.
   * @default null
   */
  selectedIndex?: Accessor<number | null> | undefined;
}

/**
 * Provides a matching callback that can be used to focus an item as the user
 * types, often used in tandem with `useListNavigation()`.
 * @see https://floating-ui.com/docs/useTypeahead
 *
 * Solid port of upstream's `useTypeahead`. Same translation notes as
 * `useListNavigation`: upstream's `useRef`s become plain `let` bindings, and
 * upstream's `store.select(...)` (imperative, non-reactive reads) become
 * plain accessor calls — Solid event handlers are already stable, so every
 * accessor read inside them observes the current value at call time. Both
 * returned parts are handler-only (no reactive attributes), so they stay
 * plain objects per the locked convention; `enabled()` is checked at the top
 * of each handler instead of upstream's whole-object `{}` swap.
 */
export function useTypeahead(
  context: FloatingRootContext | FloatingContext,
  props: UseTypeaheadProps,
): ElementProps {
  const listRef = props.listRef;
  const elementsRef = props.elementsRef;
  const activeIndex = props.activeIndex;
  const onMatchProp = props.onMatch;
  const onTyping = props.onTyping;
  const disabledIndices = () => accessDisabledIndices(props.disabledIndices);
  const enabled = () => access(props.enabled) ?? true;
  const resetMs = () => access(props.resetMs) ?? 750;
  const selectedIndex = () => props.selectedIndex?.() ?? null;

  const store = 'rootStore' in context ? context.rootStore : context;

  const open = store.useState('open');
  const domReferenceElement = store.useState('domReferenceElement');
  const floatingElement = store.useState('floatingElement');

  const timeout = createTimeout();
  let stringRefCurrent = '';
  let prevIndexRefCurrent: number | null = untrack(selectedIndex) ?? untrack(activeIndex) ?? -1;
  let matchIndexRefCurrent: number | null = null;

  function handleKeyDown(event: KeyboardEvent) {
    function isVisible(index: number) {
      const element = elementsRef?.current[index];
      return !element || isElementVisible(element);
    }

    function isItemAvailable(index: number) {
      if (!isVisible(index)) {
        return false;
      }
      // Visibility is handled above; pass an empty element list so `isListIndexDisabled`
      // resolves only the explicit `disabledIndices` (array/predicate) and skips its own
      // visibility/attribute fallbacks. Consumers that don't opt in keep matching every
      // visible item.
      const currentDisabledIndices = disabledIndices();
      return currentDisabledIndices == null || !isListIndexDisabled(EMPTY_ARRAY, index, currentDisabledIndices);
    }

    function getMatchingIndex(list: Array<string | null>, string: string, startIndex = 0) {
      if (list.length === 0) {
        return -1;
      }

      const normalizedStartIndex = ((startIndex % list.length) + list.length) % list.length;
      const lowerString = string.toLowerCase();

      for (let offset = 0; offset < list.length; offset += 1) {
        const index = (normalizedStartIndex + offset) % list.length;
        const text = list[index];
        if (!text?.toLowerCase().startsWith(lowerString) || !isItemAvailable(index)) {
          continue;
        }
        return index;
      }
      return -1;
    }

    const listContent = listRef.current;

    if (stringRefCurrent.length > 0 && event.key === ' ') {
      // Space should continue the in-progress typeahead session.
      stopEvent(event);
      onTyping?.(true);
    }

    if (stringRefCurrent.length > 0 && stringRefCurrent[0] !== ' ') {
      if (getMatchingIndex(listContent, stringRefCurrent) === -1 && event.key !== ' ') {
        onTyping?.(false);
      }
    }

    if (
      listContent == null ||
      // Character key.
      event.key.length !== 1 ||
      // Modifier key.
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }

    if (open() && event.key !== ' ') {
      stopEvent(event);
      onTyping?.(true);
    }

    // Capture whether this is a new typing session before mutating the string.
    const isNewSession = stringRefCurrent === '';
    if (isNewSession) {
      prevIndexRefCurrent = selectedIndex() ?? activeIndex() ?? -1;
    }

    // Bail out if the list contains a word like "llama" or "aaron". TODO:
    // allow it in this case, too. Unavailable items are skipped while matching, so
    // they must be ignored here as well — otherwise a hidden or disabled double-letter
    // label would block rapid cycling through the available items.
    const allowRapidSuccessionOfFirstLetter = listContent.every((text, index) =>
      text && isItemAvailable(index) ? text[0]?.toLowerCase() !== text[1]?.toLowerCase() : true,
    );

    // Allows the user to cycle through items that start with the same letter
    // in rapid succession.
    if (allowRapidSuccessionOfFirstLetter && stringRefCurrent === event.key) {
      stringRefCurrent = '';
      prevIndexRefCurrent = matchIndexRefCurrent;
    }

    stringRefCurrent += event.key;
    timeout.start(resetMs(), () => {
      stringRefCurrent = '';
      prevIndexRefCurrent = matchIndexRefCurrent;
      onTyping?.(false);
    });

    // Compute the starting index for this search.
    // If this is a new typing session (string is empty), base it on the current
    // selection/active item; otherwise continue from the last matched index.
    const prevIndex = isNewSession ? (selectedIndex() ?? activeIndex() ?? -1) : prevIndexRefCurrent;
    const startIndex = (prevIndex ?? 0) + 1;

    const index = getMatchingIndex(listContent, stringRefCurrent, startIndex);

    if (index !== -1) {
      onMatchProp?.(index);
      matchIndexRefCurrent = index;
    } else if (event.key !== ' ') {
      stringRefCurrent = '';
      onTyping?.(false);
    }
  }

  function handleBlur(event: FocusEvent) {
    const next = event.relatedTarget as Element | null;
    const currentDomReferenceElement = domReferenceElement();
    const currentFloatingElement = floatingElement();
    const withinComposite =
      contains(currentDomReferenceElement, next) || contains(currentFloatingElement, next);

    // Keep the session if focus moves within the composite (reference <-> floating).
    if (withinComposite) {
      return;
    }

    // End the current typing session when focus leaves the composite entirely.
    timeout.clear();
    stringRefCurrent = '';
    prevIndexRefCurrent = matchIndexRefCurrent;
    onTyping?.(false);
  }

  createEffect(() => {
    if (!open() && selectedIndex() !== null) {
      return;
    }

    timeout.clear();
    matchIndexRefCurrent = null;

    if (stringRefCurrent !== '') {
      stringRefCurrent = '';
    }
  });

  createEffect(() => {
    // Sync arrow key navigation but not typeahead navigation.
    if (open() && stringRefCurrent === '') {
      prevIndexRefCurrent = selectedIndex() ?? activeIndex() ?? -1;
    }
  });

  // Handler-only: plain object per the locked convention. `enabled()` is
  // checked inside each handler since the object can't reactively disappear.
  const sharedProps: NonNullable<ElementProps['reference']> = {
    onKeyDown(event: KeyboardEvent) {
      if (!enabled()) {
        return;
      }
      handleKeyDown(event);
    },
    onBlur(event: FocusEvent) {
      if (!enabled()) {
        return;
      }
      handleBlur(event);
    },
  };

  return { reference: sharedProps, floating: sharedProps };
}
