import {
  createChangeEventDetails,
  type BaseUIChangeEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { contains } from '../../floating-ui-solid/utils/element';
import {
  getNextTabbable,
  getTabbableAfterElement,
  getTabbableBeforeElement,
  isOutsideEvent,
} from '../../floating-ui-solid/utils/tabbable';

/**
 * Minimal store interface required by the focus guard helper.
 * Both `PopoverStore` and `MenuStore` satisfy this interface.
 */
interface TriggerFocusGuardStore {
  setOpen(open: boolean, eventDetails: BaseUIChangeEventDetails<typeof REASONS.focusOut>): void;
  readonly state: { readonly positionerElement: HTMLElement | null };
  context: {
    readonly beforeContentFocusGuardRef: { current: HTMLElement | null };
    readonly triggerFocusTargetRef: { current: HTMLElement | null };
  };
}

/**
 * Provides focus guard handlers for popup triggers (Popover, Menu). Solid port of upstream's
 * `useTriggerFocusGuards`.
 *
 * When the popup is open, invisible focus guard elements are placed before and after the trigger.
 * These handlers close the popup and move focus to the appropriate tabbable element when the
 * guards receive focus (i.e. when the user tabs out).
 *
 * Deviation: upstream wraps its state-changing calls in `ReactDOM.flushSync` so a subsequent
 * synchronous DOM read (the tabbable search) observes the just-committed `data-*` attributes.
 * Solid writes to the store are already synchronous and reflected in the DOM immediately — no
 * batched commit phase to flush — so no equivalent call is needed here.
 */
export function createTriggerFocusGuards(
  store: TriggerFocusGuardStore,
  triggerElementRef: { readonly current: Element | null },
) {
  let preFocusGuardElement: HTMLElement | null = null;

  function setPreFocusGuardRef(element: HTMLElement | null) {
    preFocusGuardElement = element;
  }

  function handlePreFocusGuardFocus(event: FocusEvent) {
    store.setOpen(
      false,
      createChangeEventDetails(REASONS.focusOut, event, event.currentTarget as HTMLElement),
    );

    const previousTabbable = getTabbableBeforeElement(preFocusGuardElement);
    (previousTabbable as HTMLElement | null)?.focus();
  }

  function handleFocusTargetFocus(event: FocusEvent) {
    const positionerElement = store.state.positionerElement;
    if (positionerElement && isOutsideEvent(event, positionerElement)) {
      store.context.beforeContentFocusGuardRef.current?.focus();
    } else {
      store.setOpen(
        false,
        createChangeEventDetails(REASONS.focusOut, event, event.currentTarget as HTMLElement),
      );

      let nextTabbable = getTabbableAfterElement(
        store.context.triggerFocusTargetRef.current || triggerElementRef.current,
      );

      while (nextTabbable !== null && contains(positionerElement, nextTabbable)) {
        const prevTabbable = nextTabbable;
        nextTabbable = getNextTabbable(nextTabbable);
        if (nextTabbable === prevTabbable) {
          break;
        }
      }

      (nextTabbable as HTMLElement | null)?.focus();
    }
  }

  return { setPreFocusGuardRef, handlePreFocusGuardFocus, handleFocusTargetFocus };
}
