/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, untrack, type Accessor } from 'solid-js';
import { createAnimationFrame } from '../../base-utils/createAnimationFrame';
import { warn } from '../../base-utils/warn';
import { ownerDocument } from '../../base-utils/owner';
import { isHTMLElement } from '@floating-ui/utils/dom';
import { access, type MaybeAccessor } from '../../internals/types';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { useFloatingParentNodeId, useFloatingTree } from '../components/FloatingTree';
import { FloatingTreeStore } from '../components/FloatingTreeStore';
import type { ElementProps, FloatingContext, FloatingRootContext } from '../types';
import {
  accessDisabledIndices,
  findNonDisabledListIndex,
  getMaxListIndex,
  getMinListIndex,
  isIndexOutOfListBounds,
  type DisabledIndices,
} from '../utils/composite';
import type { gridNavigation } from './gridNavigation';
import { ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, ARROW_UP } from '../utils/constants';
import {
  activeElement,
  contains,
  getFloatingFocusElement,
  getTarget,
  isTypeableCombobox,
} from '../utils/element';
import { enqueueFocus } from '../utils/enqueueFocus';
import { isVirtualClick, isVirtualPointerEvent, stopEvent } from '../utils/event';

export const ESCAPE = 'Escape';

type ListNavigationOrientation = 'vertical' | 'horizontal' | 'both';

function doSwitch(
  orientation: ListNavigationOrientation | undefined,
  vertical: boolean,
  horizontal: boolean,
) {
  switch (orientation) {
    case 'vertical':
      return vertical;
    case 'horizontal':
      return horizontal;
    default:
      return vertical || horizontal;
  }
}

function isMainOrientationKey(key: string, orientation: ListNavigationOrientation | undefined) {
  const vertical = key === ARROW_UP || key === ARROW_DOWN;
  const horizontal = key === ARROW_LEFT || key === ARROW_RIGHT;
  return doSwitch(orientation, vertical, horizontal);
}

function isMainOrientationToEndKey(
  key: string,
  orientation: ListNavigationOrientation | undefined,
  rtl: boolean,
) {
  const vertical = key === ARROW_DOWN;
  const horizontal = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  return (
    doSwitch(orientation, vertical, horizontal) || key === 'Enter' || key === ' ' || key === ''
  );
}

function isCrossOrientationOpenKey(
  key: string,
  orientation: ListNavigationOrientation | undefined,
  rtl: boolean,
) {
  const vertical = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  const horizontal = key === ARROW_DOWN;
  return doSwitch(orientation, vertical, horizontal);
}

function isCrossOrientationCloseKey(
  key: string,
  orientation: ListNavigationOrientation | undefined,
  rtl: boolean,
  grid: boolean,
) {
  const vertical = rtl ? key === ARROW_RIGHT : key === ARROW_LEFT;
  const horizontal = key === ARROW_UP;
  if (orientation === 'both' || (orientation === 'horizontal' && grid)) {
    return key === ESCAPE;
  }
  return doSwitch(orientation, vertical, horizontal);
}

export interface UseListNavigationProps {
  /**
   * A mutable container holding an array of list items, shared with the
   * caller. Translated from upstream's `listRef: React.RefObject<...>` per
   * the locked convention: a plain `{ current }` object rather than a
   * reactive value (list membership is DOM bookkeeping, not display state).
   * @default empty list
   */
  listRef: { current: Array<HTMLElement | null> };
  /**
   * The index of the currently active (focused or highlighted) item, which may
   * or may not be selected.
   */
  activeIndex: Accessor<number | null>;
  /**
   * A callback that is called when the user navigates to a new active item,
   * passed in a new `activeIndex`. Plain function (not a Solid event handler);
   * invoked as a direct call per convention.
   */
  onNavigate?: ((activeIndex: number | null, event?: Event) => void) | undefined;
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: MaybeAccessor<boolean | undefined>;
  /**
   * The currently selected item index, which may or may not be active.
   * @default null
   */
  selectedIndex?: Accessor<number | null> | undefined;
  /**
   * Whether to focus the item upon opening the floating element. 'auto' infers
   * what to do based on the input type (keyboard vs. pointer), while a boolean
   * value will force the value.
   * @default 'auto'
   */
  focusItemOnOpen?: MaybeAccessor<boolean | 'auto' | undefined>;
  /**
   * Whether hovering an item synchronizes the focus.
   * @default true
   */
  focusItemOnHover?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether pressing an arrow key on the navigation's main axis opens the
   * floating element.
   * @default true
   */
  openOnArrowKeyDown?: MaybeAccessor<boolean | undefined>;
  /**
   * By default elements with either a `disabled` or `aria-disabled` attribute
   * are skipped in the list navigation — however, this requires the items to
   * be rendered.
   * This prop allows you to manually specify indices which should be disabled,
   * overriding the default logic.
   * @default undefined
   */
  disabledIndices?: MaybeAccessor<DisabledIndices | undefined>;
  /**
   * Determines whether focus can escape the list, such that nothing is selected
   * after navigating beyond the boundary of the list. `loopFocus` must be `true`.
   * @default false
   */
  allowEscape?: MaybeAccessor<boolean | undefined>;
  /**
   * Determines whether focus should loop around when navigating past the first
   * or last item.
   * @default false
   */
  loopFocus?: MaybeAccessor<boolean | undefined>;
  /**
   * If the list is nested within another one (e.g. a nested submenu), the
   * navigation semantics change.
   * @default false
   */
  nested?: MaybeAccessor<boolean | undefined>;
  /**
   * Allows to specify the orientation of the parent list, which is used to
   * determine the direction of the navigation.
   */
  parentOrientation?: MaybeAccessor<ListNavigationOrientation | undefined>;
  /**
   * Whether the direction of the floating element's navigation is in RTL
   * layout.
   * @default false
   */
  rtl?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether the focus is virtual (using `aria-activedescendant`).
   * @default false
   */
  virtual?: MaybeAccessor<boolean | undefined>;
  /**
   * The orientation in which navigation occurs.
   * @default 'vertical'
   */
  orientation?: MaybeAccessor<ListNavigationOrientation | undefined>;
  /**
   * The id of the root component.
   */
  id?: MaybeAccessor<string | undefined>;
  /**
   * Whether to clear the active index when the pointer leaves an item.
   * @default true
   */
  resetOnPointerLeave?: MaybeAccessor<boolean | undefined>;
  /**
   * External FloatingTree to use when the one provided by context can't be used.
   */
  externalTree?: FloatingTreeStore | undefined;
  /**
   * Computes two-dimensional list navigation for grid-capable consumers.
   */
  grid?: typeof gridNavigation | null | undefined;
}

/**
 * Adds arrow key-based navigation of a list of items, either using real DOM
 * focus or virtual focus.
 * @see https://floating-ui.com/docs/useListNavigation
 *
 * Solid port of upstream's `useListNavigation`.
 *
 * Reactivity translation notes:
 * - Upstream's many `useRef`s (`indexRef`, `keyRef`, `isPointerModalityRef`,
 *   `focusItemOnOpenRef`, `previousMountedRef`, `previousOpenRef`,
 *   `forceSyncFocusRef`, `forceScrollIntoViewRef`, `cancelQueuedFocusRef`) are
 *   internal mutable bookkeeping never read reactively — they become plain
 *   `let` bindings closed over by this hook's helper functions (the hook body
 *   runs once, so there's no "next render" to lose them to).
 * - `useValueAsRef` exists in React purely to read a prop's *latest* value
 *   inside a callback/effect without re-creating it on every change (a
 *   render-identity problem Solid doesn't have). Every such
 *   `xxxRef.current` read below collapses to a direct call of the
 *   corresponding option accessor at the read site — an ordinary function
 *   call in Solid always observes the current value.
 * - `store.select('open')` (imperative, non-reactive read to avoid recreating
 *   a memoized handler) likewise collapses to a plain `open()` call: Solid
 *   handlers are stable already, so every accessor read inside them is
 *   naturally "fresh at call time" — matching upstream's intent regardless of
 *   whether the prop was in a particular `useMemo`'s dependency array.
 * - The one deliberate exception is `selectedIndexRef.current` inside the
 *   "sync activeIndex" effect: upstream *excludes* `selectedIndex` from that
 *   effect's deps on purpose (so the effect doesn't re-run when only
 *   `selectedIndex` changes) while still wanting its latest value. That's
 *   ported with `untrack(selectedIndex)`.
 * - `item`/`trigger` carry no reactive attributes (handlers only) and stay
 *   plain objects per the locked convention; `floating`/`reference` carry
 *   `aria-orientation`/`aria-activedescendant` and are zero-arg thunks.
 *   Deviation: upstream's `enabled` gates the *entire* returned `ElementProps`
 *   object (swapping between `{}` and the full set). Since `item`/`trigger`
 *   must stay plain objects here, `enabled` is instead checked at the top of
 *   each of their handlers (no-op when disabled) while `floating`/`reference`
 *   — already thunks — return `{}` outright when disabled.
 */
export function useListNavigation(
  context: FloatingRootContext | FloatingContext,
  props: UseListNavigationProps,
): ElementProps {
  const listRef = props.listRef;
  const activeIndex = props.activeIndex;
  const onNavigateProp = props.onNavigate ?? (() => {});
  const enabled = () => access(props.enabled) ?? true;
  const selectedIndex = () => props.selectedIndex?.() ?? null;
  const allowEscape = () => access(props.allowEscape) ?? false;
  const loopFocus = () => access(props.loopFocus) ?? false;
  const nested = () => access(props.nested) ?? false;
  const rtl = () => access(props.rtl) ?? false;
  const virtual = () => access(props.virtual) ?? false;
  const focusItemOnOpen = () => access(props.focusItemOnOpen) ?? 'auto';
  const focusItemOnHover = () => access(props.focusItemOnHover) ?? true;
  const openOnArrowKeyDown = () => access(props.openOnArrowKeyDown) ?? true;
  const disabledIndices = () => accessDisabledIndices(props.disabledIndices);
  const orientation = () => access(props.orientation) ?? 'vertical';
  const parentOrientationProp = () => access(props.parentOrientation);
  const id = () => access(props.id);
  const resetOnPointerLeave = () => access(props.resetOnPointerLeave) ?? true;
  const externalTree = props.externalTree;
  const navigateGrid = props.grid ?? null;
  const isGrid = navigateGrid != null;

  if (process.env.NODE_ENV !== 'production') {
    if (untrack(allowEscape)) {
      if (!untrack(loopFocus)) {
        warn('`useListNavigation` looping must be enabled to allow escaping.');
      }
      if (!untrack(virtual)) {
        warn('`useListNavigation` must be virtual to allow escaping.');
      }
    }

    if (untrack(orientation) === 'vertical' && isGrid) {
      warn(
        'In grid list navigation mode, the `orientation` should',
        'be either "horizontal" or "both".',
      );
    }
  }

  const store = 'rootStore' in context ? context.rootStore : context;

  const open = store.useState('open');
  const floatingElement = store.useState('floatingElement');
  const domReferenceElement = store.useState('domReferenceElement');

  const dataRef = store.context.dataRef;

  const floatingFocusElement = () => getFloatingFocusElement(floatingElement());

  const parentId = useFloatingParentNodeId();
  const tree = useFloatingTree(externalTree);

  // Internal mutable bookkeeping (upstream `useRef`s) — see the note above.
  let focusItemOnOpenRefCurrent = untrack(focusItemOnOpen);
  let indexRefCurrent = untrack(selectedIndex) ?? -1;
  let keyRefCurrent: string | null = null;
  let isPointerModalityRefCurrent = true;
  let previousMountedRefCurrent = !!untrack(floatingElement);
  let previousOpenRefCurrent = untrack(open);
  let forceSyncFocusRefCurrent = false;
  let forceScrollIntoViewRefCurrent = false;
  let cancelQueuedFocusRefCurrent: (() => void) | null = null;

  function onNavigate(event?: Event) {
    onNavigateProp(indexRefCurrent === -1 ? null : indexRefCurrent, event);
  }

  const focusFrame = createAnimationFrame();
  const waitForListPopulatedFrame = createAnimationFrame();

  function focusItem() {
    function runFocus(focusTarget: HTMLElement) {
      if (virtual()) {
        tree?.events.emit('virtualfocus', focusTarget);
      } else {
        cancelQueuedFocusRefCurrent = enqueueFocus(focusTarget, {
          sync: forceSyncFocusRefCurrent,
          preventScroll: true,
        });
      }
    }

    const initialItem = listRef.current[indexRefCurrent];
    const forceScrollIntoView = forceScrollIntoViewRefCurrent;

    if (initialItem) {
      runFocus(initialItem);
    }

    const scheduler = forceSyncFocusRefCurrent
      ? (callback: () => void) => callback()
      : (callback: () => void) => focusFrame.request(callback);

    scheduler(() => {
      const waitedItem = listRef.current[indexRefCurrent] || initialItem;

      if (!waitedItem) {
        return;
      }

      if (!initialItem) {
        runFocus(waitedItem);
      }

      // NOTE: upstream gates this on the (always-truthy) `item` ElementProps
      // object rather than a real condition — porting the observable
      // behavior verbatim; see the "suspected upstream bugs" note in the
      // final report.
      const shouldScrollIntoView = forceScrollIntoView || !isPointerModalityRefCurrent;

      if (shouldScrollIntoView) {
        // JSDOM doesn't support `.scrollIntoView()` but it's widely supported
        // by all browsers.
        waitedItem.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
    });
  }

  // Effect 1: keep the parent orientation lookup (read by nested children)
  // in sync with the current `orientation` option.
  createEffect(() => {
    dataRef.current.orientation = orientation();
  });

  // Effect 2: sync `selectedIndex` to be the `activeIndex` upon opening the
  // floating element. Also, reset `activeIndex` upon closing the floating
  // element.
  createEffect(() => {
    if (!enabled()) {
      return;
    }

    if (open() && floatingElement()) {
      indexRefCurrent = selectedIndex() ?? -1;
      if (focusItemOnOpenRefCurrent && selectedIndex() != null) {
        // Regardless of the pointer modality, we want to ensure the selected
        // item comes into view when the floating element is opened.
        forceScrollIntoViewRefCurrent = true;
        onNavigate();
      }
    } else if (previousMountedRefCurrent) {
      // Reset the active index when the list is no longer open and mounted
      // (closing or unmounting).
      indexRefCurrent = -1;
      onNavigate();
    }
  });

  // Effect 3: sync `activeIndex` to be the focused item while the floating
  // element is open.
  createEffect(() => {
    if (!enabled()) {
      return;
    }
    if (!open()) {
      forceSyncFocusRefCurrent = false;
      return;
    }
    if (!floatingElement()) {
      return;
    }

    const currentActiveIndex = activeIndex();
    const currentNested = nested();
    const currentOrientation = orientation();
    const currentRtl = rtl();

    if (currentActiveIndex == null) {
      forceSyncFocusRefCurrent = false;

      // Deliberately untracked: upstream reads `selectedIndexRef.current`
      // here (not `selectedIndex` directly) so this effect doesn't re-run
      // when only `selectedIndex` changes, while still observing its latest
      // value.
      if (untrack(selectedIndex) != null) {
        return;
      }

      // Reset while the floating element was open (e.g. the list changed).
      if (previousMountedRefCurrent) {
        indexRefCurrent = -1;
        focusItem();
      }

      // Initial sync.
      if (
        (!previousOpenRefCurrent || !previousMountedRefCurrent) &&
        focusItemOnOpenRefCurrent &&
        (keyRefCurrent != null || (focusItemOnOpenRefCurrent === true && keyRefCurrent == null))
      ) {
        let runs = 0;
        const waitForListPopulated = () => {
          if (listRef.current[0] == null) {
            // Avoid letting the browser paint if possible on the first try,
            // otherwise use rAF. Don't try more than twice, since something
            // is wrong otherwise.
            if (runs < 2) {
              const scheduler = runs
                ? (callback: () => void) => waitForListPopulatedFrame.request(callback)
                : queueMicrotask;
              scheduler(waitForListPopulated);
            }
            runs += 1;
          } else {
            // Initially focus the first non-disabled item. `disabledIndices`
            // is deliberately omitted here so attribute-disabled items
            // (`disabled`/`aria-disabled`) are skipped on open even when the
            // consumer passes an empty `disabledIndices` array.
            indexRefCurrent =
              keyRefCurrent == null ||
              isMainOrientationToEndKey(keyRefCurrent, currentOrientation, currentRtl) ||
              currentNested
                ? getMinListIndex(listRef)
                : getMaxListIndex(listRef);
            keyRefCurrent = null;
            onNavigate();
          }
        };

        waitForListPopulated();
      }
    } else if (!isIndexOutOfListBounds(listRef.current, currentActiveIndex)) {
      indexRefCurrent = currentActiveIndex;
      focusItem();
      forceScrollIntoViewRefCurrent = false;
    }
  });

  // Effect 4: ensure the parent floating element has focus when a nested
  // child closes, to allow arrow key navigation to work after the pointer
  // leaves the child.
  createEffect(() => {
    if (
      !enabled() ||
      floatingElement() ||
      !tree ||
      virtual() ||
      !previousMountedRefCurrent
    ) {
      return;
    }

    const nodes = tree.nodesRef.current;
    const parent = nodes.find((node) => node.id === parentId)?.context?.elements.floating();
    const currentDomReferenceElement = domReferenceElement();
    // `floatingElement` is null here (see the guard above), so resolve the owner document from an
    // in-DOM element for realm-safety (shadow DOM/iframes): the reference element, falling back to
    // the parent floating element when the reference is virtual (`domReferenceElement` is null).
    const activeEl = activeElement(ownerDocument(currentDomReferenceElement ?? parent ?? null));
    const treeContainsActiveEl = nodes.some(
      (node) => node.context && contains(node.context.elements.floating(), activeEl),
    );

    if (parent && !treeContainsActiveEl && isPointerModalityRefCurrent) {
      parent.focus({ preventScroll: true });
    }
  });

  // Effect 5: snapshot `open`/`floatingElement` for the next run of effects 2
  // and 3 above. No dep array upstream (runs every render); tracking exactly
  // the two values it reads reproduces that.
  createEffect(() => {
    previousOpenRefCurrent = open();
    previousMountedRefCurrent = !!floatingElement();
  });

  // Effect 6: reset the typed-ahead key and `focusItemOnOpen` override when
  // closed.
  createEffect(() => {
    if (!open()) {
      keyRefCurrent = null;
      focusItemOnOpenRefCurrent = focusItemOnOpen();
    }
  });

  function syncCurrentTarget(event: Event) {
    if (!open()) {
      return;
    }

    const index = listRef.current.indexOf(event.currentTarget as HTMLElement);
    if (index !== -1 && (indexRefCurrent !== index || activeIndex() !== index)) {
      indexRefCurrent = index;
      onNavigate(event);
    }
  }

  function getParentOrientation(): ListNavigationOrientation | undefined {
    return (
      parentOrientationProp() ??
      (tree?.nodesRef.current.find((node) => node.id === parentId)?.context?.dataRef?.current
        .orientation as ListNavigationOrientation | undefined)
    );
  }

  function getMinEnabledIndex() {
    return getMinListIndex(listRef, disabledIndices());
  }

  function commonOnKeyDown(event: KeyboardEvent) {
    isPointerModalityRefCurrent = false;
    forceSyncFocusRefCurrent = true;

    // When composing a character, Chrome fires ArrowDown twice. Firefox/Safari
    // don't appear to suffer from this. `event.isComposing` is avoided due to
    // Safari not supporting it properly (although it's not needed in the first
    // place for Safari, just avoiding any possible issues).
    if ((event as unknown as { which?: number }).which === 229) {
      return;
    }

    const currentOpen = open();
    const currentOrientation = orientation();
    const currentRtl = rtl();
    const currentVirtual = virtual();
    const currentNested = nested();
    const currentLoopFocus = loopFocus();
    const currentAllowEscape = allowEscape();
    const currentDisabledIndices = disabledIndices();
    const currentDomReferenceElement = domReferenceElement();

    // If the floating element is animating out, ignore navigation. Otherwise,
    // the `activeIndex` gets set to 0 despite not being open so the next time
    // the user ArrowDowns, the first item won't be focused.
    if (!currentOpen && event.currentTarget === floatingFocusElement()) {
      return;
    }

    if (currentNested && isCrossOrientationCloseKey(event.key, currentOrientation, currentRtl, isGrid)) {
      // If the nested list's close key is also the parent navigation key,
      // let the parent navigate. Otherwise, stop propagating the event.
      if (!isMainOrientationKey(event.key, getParentOrientation())) {
        stopEvent(event);
      }

      store.setOpen(false, createChangeEventDetails(REASONS.listNavigation, event));

      if (isHTMLElement(currentDomReferenceElement)) {
        if (currentVirtual) {
          tree?.events.emit('virtualfocus', currentDomReferenceElement);
        } else {
          currentDomReferenceElement.focus();
        }
      }

      return;
    }

    const currentIndex = indexRefCurrent;
    const minIndex = getMinListIndex(listRef, currentDisabledIndices);
    const maxIndex = getMaxListIndex(listRef, currentDisabledIndices);

    if (!isTypeableCombobox(currentDomReferenceElement)) {
      if (event.key === 'Home') {
        stopEvent(event);
        indexRefCurrent = minIndex;
        onNavigate(event);
      }

      if (event.key === 'End') {
        stopEvent(event);
        indexRefCurrent = maxIndex;
        onNavigate(event);
      }
    }

    // Grid navigation is injected by grid-capable consumers so non-grid
    // consumers (menu, select) tree-shake the grid helpers out.
    if (navigateGrid != null) {
      const index = navigateGrid(
        event,
        indexRefCurrent,
        listRef,
        currentOrientation,
        currentLoopFocus,
        currentRtl,
        currentDisabledIndices,
        minIndex,
        maxIndex,
      );

      if (index != null) {
        indexRefCurrent = index;
        onNavigate(event);
      }

      if (currentOrientation === 'both') {
        return;
      }
    }

    if (isMainOrientationKey(event.key, currentOrientation)) {
      stopEvent(event);

      // Reset the index if no item is focused.
      if (
        currentOpen &&
        !currentVirtual &&
        activeElement(ownerDocument(event.currentTarget as Element | null)) === event.currentTarget
      ) {
        indexRefCurrent = isMainOrientationToEndKey(event.key, currentOrientation, currentRtl)
          ? minIndex
          : maxIndex;
        onNavigate(event);
        return;
      }

      if (isMainOrientationToEndKey(event.key, currentOrientation, currentRtl)) {
        if (currentLoopFocus) {
          if (currentIndex >= maxIndex) {
            if (currentAllowEscape && currentIndex !== listRef.current.length) {
              indexRefCurrent = -1;
            } else {
              // Give time for virtualizers to update the listRef.
              forceSyncFocusRefCurrent = false;
              indexRefCurrent = minIndex;
            }
          } else {
            indexRefCurrent = findNonDisabledListIndex(listRef.current, {
              startingIndex: currentIndex,
              disabledIndices: currentDisabledIndices,
            });
          }
        } else {
          indexRefCurrent = Math.min(
            maxIndex,
            findNonDisabledListIndex(listRef.current, {
              startingIndex: currentIndex,
              disabledIndices: currentDisabledIndices,
            }),
          );
        }
      } else if (currentLoopFocus) {
        if (currentIndex <= minIndex) {
          if (currentAllowEscape && currentIndex !== -1) {
            indexRefCurrent = listRef.current.length;
          } else {
            // Give time for virtualizers to update the listRef.
            forceSyncFocusRefCurrent = false;
            indexRefCurrent = maxIndex;
          }
        } else {
          indexRefCurrent = findNonDisabledListIndex(listRef.current, {
            startingIndex: currentIndex,
            decrement: true,
            disabledIndices: currentDisabledIndices,
          });
        }
      } else {
        indexRefCurrent = Math.max(
          minIndex,
          findNonDisabledListIndex(listRef.current, {
            startingIndex: currentIndex,
            decrement: true,
            disabledIndices: currentDisabledIndices,
          }),
        );
      }

      if (isIndexOutOfListBounds(listRef.current, indexRefCurrent)) {
        indexRefCurrent = -1;
      }

      onNavigate(event);
    }
  }

  // Handler-only: plain object per the locked convention (no reactive
  // attributes). `enabled()` is checked at the top of each handler since the
  // object itself can't reactively disappear.
  const itemElementProps: NonNullable<ElementProps['item']> = {
    onFocus(event: FocusEvent) {
      if (!enabled()) {
        return;
      }
      forceSyncFocusRefCurrent = true;
      syncCurrentTarget(event);
    },
    onClick(event: MouseEvent) {
      if (!enabled()) {
        return;
      }
      (event.currentTarget as HTMLElement)?.focus({ preventScroll: true }); // Safari
    },
    onMouseMove(event: MouseEvent) {
      if (!enabled()) {
        return;
      }
      forceSyncFocusRefCurrent = true;
      forceScrollIntoViewRefCurrent = false;
      if (focusItemOnHover()) {
        syncCurrentTarget(event);
      }
    },
    onPointerLeave(event: PointerEvent) {
      if (!enabled()) {
        return;
      }
      if (!open() || !isPointerModalityRefCurrent || event.pointerType === 'touch') {
        return;
      }

      forceSyncFocusRefCurrent = true;

      const relatedTarget = event.relatedTarget as HTMLElement | null;

      if (!focusItemOnHover() || listRef.current.includes(relatedTarget)) {
        return;
      }

      if (!resetOnPointerLeave()) {
        return;
      }

      cancelQueuedFocusRefCurrent?.();
      cancelQueuedFocusRefCurrent = null;

      indexRefCurrent = -1;
      onNavigate(event);

      if (!virtual()) {
        const floatingFocusEl = floatingFocusElement();
        const activeEl = activeElement(ownerDocument(floatingFocusEl));
        if (floatingFocusEl && contains(floatingFocusEl, activeEl)) {
          floatingFocusEl.focus({ preventScroll: true });
        }
      }
    },
  };

  function ariaActiveDescendantProp(): { 'aria-activedescendant'?: string } {
    const currentActiveIndex = activeIndex();
    if (virtual() && open() && currentActiveIndex != null) {
      return { 'aria-activedescendant': `${id()}-${currentActiveIndex}` };
    }
    return {};
  }

  // Reactive: carries `aria-orientation`/`aria-activedescendant`, so this is
  // a zero-arg thunk per the locked convention.
  function floatingElementProps(): NonNullable<ElementProps['floating']> {
    if (!enabled()) {
      return {};
    }

    const currentOrientation = orientation();
    const currentDomReferenceElement = domReferenceElement();

    return {
      'aria-orientation': currentOrientation === 'both' ? undefined : currentOrientation,
      ...(!isTypeableCombobox(currentDomReferenceElement) ? ariaActiveDescendantProp() : {}),
      onKeyDown(event: KeyboardEvent) {
        // Close submenu on Shift+Tab
        if (event.key === 'Tab' && event.shiftKey && open() && !virtual()) {
          // If the event originated from within a nested element (e.g., a Dialog opened from
          // within the menu), don't close the menu. The nested element has its own focus
          // management and should handle the Tab key.
          const target = getTarget(event) as Element | null;
          if (target && !contains(floatingFocusElement(), target)) {
            return;
          }

          stopEvent(event);
          store.setOpen(false, createChangeEventDetails(REASONS.focusOut, event));

          const currentDomRef = domReferenceElement();
          if (isHTMLElement(currentDomRef)) {
            currentDomRef.focus();
          }

          return;
        }

        commonOnKeyDown(event);
      },
      onPointerMove() {
        isPointerModalityRefCurrent = true;
      },
    };
  }

  function openOnNavigationKeyDown(event: KeyboardEvent) {
    store.setOpen(
      true,
      createChangeEventDetails(REASONS.listNavigation, event, event.currentTarget as HTMLElement),
    );
  }

  function checkVirtualMouse(event: MouseEvent) {
    if (focusItemOnOpen() === 'auto' && isVirtualClick(event)) {
      focusItemOnOpenRefCurrent = !virtual();
    }
  }

  function checkVirtualPointer(event: PointerEvent) {
    // `pointerdown` fires first, reset the state then perform the checks.
    focusItemOnOpenRefCurrent = focusItemOnOpen();
    if (focusItemOnOpen() === 'auto' && isVirtualPointerEvent(event)) {
      focusItemOnOpenRefCurrent = true;
    }
  }

  // Handler-only: plain object per the locked convention.
  const triggerElementProps: NonNullable<ElementProps['trigger']> = {
    onKeyDown(event: KeyboardEvent) {
      if (!enabled()) {
        return;
      }

      // Fresh, non-reactive read (matches upstream's `store.select('open')`,
      // deliberately avoiding staleness within this handler call).
      const currentOpen = open();
      isPointerModalityRefCurrent = false;

      const currentOrientation = orientation();
      const currentRtl = rtl();
      const currentNested = nested();
      const currentOpenOnArrowKeyDown = openOnArrowKeyDown();
      const currentVirtual = virtual();

      const isArrowKey = event.key.startsWith('Arrow');
      const isParentCrossOpenKey = isCrossOrientationOpenKey(
        event.key,
        getParentOrientation(),
        currentRtl,
      );
      const isMainKey = isMainOrientationKey(event.key, currentOrientation);
      const isNavigationKey =
        (currentNested ? isParentCrossOpenKey : isMainKey) ||
        event.key === 'Enter' ||
        event.key.trim() === '';

      if (currentVirtual && currentOpen) {
        commonOnKeyDown(event);
        return;
      }

      // If a floating element should not open on arrow key down, avoid
      // setting `activeIndex` while it's closed.
      if (!currentOpen && !currentOpenOnArrowKeyDown && isArrowKey) {
        return;
      }

      if (isNavigationKey) {
        const isParentMainKey = isMainOrientationKey(event.key, getParentOrientation());
        keyRefCurrent = currentNested && isParentMainKey ? null : event.key;
      }

      if (currentNested) {
        if (isParentCrossOpenKey) {
          stopEvent(event);

          if (currentOpen) {
            indexRefCurrent = getMinEnabledIndex();
            onNavigate(event);
          } else {
            openOnNavigationKeyDown(event);
          }
        }

        return;
      }

      if (isMainKey) {
        const currentSelectedIndex = untrack(selectedIndex);
        if (currentSelectedIndex != null) {
          indexRefCurrent = currentSelectedIndex;
        }

        stopEvent(event);

        if (!currentOpen && currentOpenOnArrowKeyDown) {
          openOnNavigationKeyDown(event);
        } else {
          commonOnKeyDown(event);
        }

        if (currentOpen) {
          onNavigate(event);
        }
      }
    },
    onFocus(event: FocusEvent) {
      if (!enabled()) {
        return;
      }
      if (open() && !virtual()) {
        indexRefCurrent = -1;
        onNavigate(event);
      }
    },
    onPointerDown: checkVirtualPointer,
    onPointerEnter: checkVirtualPointer,
    onMouseDown: checkVirtualMouse,
    onClick: checkVirtualMouse,
  };

  // Reactive: carries `aria-activedescendant`, so this is a zero-arg thunk.
  function referenceElementProps(): NonNullable<ElementProps['reference']> {
    if (!enabled()) {
      return {};
    }
    return {
      ...ariaActiveDescendantProp(),
      ...triggerElementProps,
    };
  }

  return {
    reference: referenceElementProps,
    floating: floatingElementProps,
    item: itemElementProps,
    trigger: triggerElementProps,
  };
}
