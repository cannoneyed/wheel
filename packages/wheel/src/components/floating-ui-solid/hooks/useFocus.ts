/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, onCleanup, untrack, type Accessor } from 'solid-js';
import { getWindow, isElement, isHTMLElement } from '@floating-ui/utils/dom';
import { platform } from '../../base-utils/platform/index';
import { ownerDocument } from '../../base-utils/owner';
import { createTimeout } from '../../base-utils/createTimeout';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { FloatingUIOpenChangeDetails } from '../../internals/types';
import type { ElementProps, FloatingContext, FloatingRootContext } from '../types';
import {
  activeElement,
  contains,
  getTarget,
  isTargetInsideEnabledTrigger,
  isTypeableElement,
  matchesFocusVisible,
} from '../utils/element';

const isMacSafari = platform.os.mac && platform.engine.webkit;

/**
 * Not yet ported anywhere shared (the focus-guard DOM markers it targets
 * live in the not-yet-ported `FloatingFocusManager`). Scoped to this file
 * until that lands.
 */
function createAttribute(name: string) {
  return `data-base-ui-${name}`;
}

export interface UseFocusProps {
  /**
   * Whether the Hook is enabled, including all internal effects and event
   * handlers.
   * @default true
   */
  enabled?: Accessor<boolean> | undefined;
  /**
   * Waits for the specified time before opening.
   * Unlike upstream (which also accepts a plain `number` or a `() => number`
   * function to accommodate non-reactive React props), an `Accessor` already
   * covers both cases here.
   * @default undefined
   */
  delay?: Accessor<number | undefined> | undefined;
}

/**
 * Opens the floating element while the reference element has focus, like CSS
 * `:focus`.
 * @see https://floating-ui.com/docs/useFocus
 *
 * Solid port of upstream's `useFocus`. Upstream's two setup `useEffect`s
 * depend on `[store, enabled]` — not on the current reference element — so
 * they only re-run when `enabled` toggles, reading whatever
 * `domReferenceElement` is current at that moment. The Solid effects below
 * mirror that: `enabled()` is the only tracked read; the reference element is
 * read via `untrack` so a later reference swap alone doesn't re-run them.
 */
export function useFocus(
  context: FloatingRootContext | FloatingContext,
  props: UseFocusProps = {},
): ElementProps {
  const enabled = () => props.enabled?.() ?? true;
  const delay = () => props.delay?.();

  const store = 'rootStore' in context ? context.rootStore : context;
  const { events, dataRef } = store.context;

  let blockFocus = false;
  // Track which reference should be blocked from re-opening after Escape/press dismissal.
  let blockedReference: Element | null = null;
  let keyboardModality = true;

  const timeout = createTimeout();

  createEffect(() => {
    const isEnabled = enabled();
    if (!isEnabled) {
      return;
    }

    const domReference = untrack(() => store.state.domReferenceElement);
    const win = getWindow(domReference);

    // If the reference was focused and the user left the tab/window, and the
    // floating element was not open, the focus should be blocked when they
    // return to the tab/window.
    function onBlur() {
      const currentDomReference = store.state.domReferenceElement;
      if (
        !store.state.open &&
        isHTMLElement(currentDomReference) &&
        currentDomReference === activeElement(ownerDocument(currentDomReference))
      ) {
        blockFocus = true;
      }
    }

    function onKeyDown() {
      keyboardModality = true;
    }

    function onPointerDown() {
      keyboardModality = false;
    }

    win.addEventListener('blur', onBlur);
    if (isMacSafari) {
      win.addEventListener('keydown', onKeyDown, true);
      win.addEventListener('pointerdown', onPointerDown, true);
    }

    onCleanup(() => {
      win.removeEventListener('blur', onBlur);
      if (isMacSafari) {
        win.removeEventListener('keydown', onKeyDown, true);
        win.removeEventListener('pointerdown', onPointerDown, true);
      }
    });
  });

  createEffect(() => {
    if (!enabled()) {
      return;
    }

    function onOpenChangeLocal(details: FloatingUIOpenChangeDetails) {
      if (details.reason === REASONS.triggerPress || details.reason === REASONS.escapeKey) {
        const referenceElement = store.state.domReferenceElement;
        if (isElement(referenceElement)) {
          blockedReference = referenceElement;
          blockFocus = true;
        }
      }
    }

    events.on('openchange', onOpenChangeLocal);
    onCleanup(() => {
      events.off('openchange', onOpenChangeLocal);
    });
  });

  function resetBlockedFocus() {
    blockFocus = false;
    blockedReference = null;
  }

  const reference: ElementProps['reference'] = {
    onMouseLeave() {
      if (!enabled()) {
        return;
      }
      resetBlockedFocus();
    },
    onFocus(event: FocusEvent) {
      if (!enabled()) {
        return;
      }

      const focusTarget = event.currentTarget as Element;

      if (blockFocus) {
        if (blockedReference === focusTarget) {
          return;
        }

        resetBlockedFocus();
      }

      const target = getTarget(event);

      if (isElement(target)) {
        // Safari fails to match `:focus-visible` if focus was initially
        // outside the document.
        if (isMacSafari && !event.relatedTarget) {
          if (!keyboardModality && !isTypeableElement(target)) {
            return;
          }
        } else if (!matchesFocusVisible(target)) {
          return;
        }
      }

      const movedFromOtherEnabledTrigger = isTargetInsideEnabledTrigger(
        event.relatedTarget,
        store.context.triggerElements,
      );

      const currentTarget = event.currentTarget as HTMLElement;
      const delayValue = delay();

      if (
        (store.state.open && movedFromOtherEnabledTrigger) ||
        delayValue === 0 ||
        delayValue === undefined
      ) {
        store.setOpen(true, createChangeEventDetails(REASONS.triggerFocus, event, currentTarget));
        return;
      }

      timeout.start(delayValue, () => {
        if (blockFocus) {
          return;
        }

        store.setOpen(true, createChangeEventDetails(REASONS.triggerFocus, event, currentTarget));
      });
    },
    onBlur(event: FocusEvent) {
      if (!enabled()) {
        return;
      }

      resetBlockedFocus();

      const relatedTarget = event.relatedTarget;

      // Hit the non-modal focus management portal guard. Focus will be
      // moved into the floating element immediately after.
      const movedToFocusGuard =
        isElement(relatedTarget) &&
        (relatedTarget as Element).hasAttribute(createAttribute('focus-guard')) &&
        (relatedTarget as Element).getAttribute('data-type') === 'outside';

      // Wait for the window blur listener to fire.
      timeout.start(0, () => {
        const domReference = store.state.domReferenceElement;
        const activeEl = activeElement(ownerDocument(domReference));

        // Focus left the page, keep it open.
        if (!relatedTarget && activeEl === domReference) {
          return;
        }

        // When focusing the reference element (e.g. regular click), then
        // clicking into the floating element, prevent it from hiding.
        // Note: it must be focusable, e.g. `tabindex="-1"`.
        // We can not rely on relatedTarget to point to the correct element
        // as it will only point to the shadow host of the newly focused element
        // and not the element that actually has received focus if it is located
        // inside a shadow root.
        if (
          contains(dataRef.current.floatingContext?.refs.floating.current, activeEl) ||
          contains(domReference, activeEl) ||
          movedToFocusGuard
        ) {
          return;
        }

        // If the next focused element is one of the triggers, do not close
        // the floating element. The focus handler of that trigger will
        // handle the open state.
        const nextFocusedElement = relatedTarget ?? activeEl;
        if (isTargetInsideEnabledTrigger(nextFocusedElement, store.context.triggerElements)) {
          return;
        }

        store.setOpen(false, createChangeEventDetails(REASONS.triggerFocus, event));
      });
    },
  };

  return { reference, trigger: reference };
}
