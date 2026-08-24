/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { Accessor } from 'solid-js';
import { createAnimationFrame } from '../../base-utils/createAnimationFrame';
import { createTimeout } from '../../base-utils/createTimeout';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { ElementProps, FloatingContext, FloatingRootContext } from '../types';
import { getTarget, isTypeableElement } from '../utils/element';
import { isMouseLikePointerType } from '../utils/event';

export interface UseClickProps {
  /**
   * Whether the Hook is enabled, including all internal effects and event
   * handlers.
   * @default true
   */
  enabled?: Accessor<boolean> | undefined;
  /**
   * The type of event to use to determine a “click” with mouse input.
   * Keyboard clicks work as normal.
   * @default 'click'
   */
  event?: Accessor<'click' | 'mousedown' | 'mousedown-only' | undefined> | undefined;
  /**
   * Whether to toggle the open state with repeated clicks.
   * @default true
   */
  toggle?: Accessor<boolean | undefined> | undefined;
  /**
   * Whether to ignore the logic for mouse input (for example, if `useHover()`
   * is also being used).
   * @default false
   */
  ignoreMouse?: Accessor<boolean | undefined> | undefined;
  /**
   * If already open from another event such as the `useHover()` Hook,
   * determines whether to keep the floating element open when clicking the
   * reference element for the first time.
   * @default true
   */
  stickIfOpen?: Accessor<boolean | undefined> | undefined;
  /**
   * Touch-only delay (ms) before opening. Useful to allow mobile viewport/keyboard to settle.
   * @default 0
   */
  touchOpenDelay?: Accessor<number | undefined> | undefined;
  /**
   * The reason for the click.
   * @default REASONS.triggerPress
   */
  reason?:
    | Accessor<typeof REASONS.triggerPress | typeof REASONS.inputPress | undefined>
    | undefined;
}

/**
 * Opens or closes the floating element when clicking the reference element.
 * @see https://floating-ui.com/docs/useClick
 *
 * Solid port of upstream's `useClick`. Upstream memoizes the returned
 * `reference` props object via `useMemo` because each React render produces a
 * new object otherwise; here the hook body runs exactly once, so `reference`
 * is a plain object built directly. `enabled` can't gate the whole returned
 * object the way upstream's early-return-`EMPTY_OBJECT` does (that would
 * require re-running hook setup), so each handler checks `enabled()` first
 * and no-ops when disabled — the same observable behavior (no interactions)
 * with a stable object identity instead.
 */
export function useClick(
  context: FloatingRootContext | FloatingContext,
  props: UseClickProps = {},
): ElementProps {
  const enabled = () => props.enabled?.() ?? true;
  const eventOption = () => props.event?.() ?? 'click';
  const toggle = () => props.toggle?.() ?? true;
  const ignoreMouse = () => props.ignoreMouse?.() ?? false;
  const stickIfOpen = () => props.stickIfOpen?.() ?? true;
  const touchOpenDelay = () => props.touchOpenDelay?.() ?? 0;
  const reason = () => props.reason?.() ?? REASONS.triggerPress;

  const store = 'rootStore' in context ? context.rootStore : context;
  const dataRef = store.context.dataRef;

  let pointerType: 'mouse' | 'pen' | 'touch' | undefined;
  const frame = createAnimationFrame();
  const touchOpenTimeout = createTimeout();

  function setOpenWithTouchDelay(
    nextOpen: boolean,
    nativeEvent: MouseEvent,
    target: HTMLElement,
    currentPointerType: 'mouse' | 'pen' | 'touch' | undefined,
  ) {
    const details = createChangeEventDetails(reason(), nativeEvent, target);

    if (nextOpen && currentPointerType === 'touch' && touchOpenDelay() > 0) {
      touchOpenTimeout.start(touchOpenDelay(), () => {
        store.setOpen(true, details);
      });
    } else {
      store.setOpen(nextOpen, details);
    }
  }

  function getNextOpen(
    open: boolean,
    currentTarget: EventTarget | null,
    isClickLikeOpenEvent: (eventType: string | undefined) => boolean,
  ) {
    const openEvent = dataRef.current.openEvent;
    const hasClickedOnInactiveTrigger = store.state.domReferenceElement !== currentTarget;

    if (open && hasClickedOnInactiveTrigger) {
      // Moving between triggers should always open the newly active one.
      return true;
    }

    if (!open) {
      // A closed popup should open on the next press.
      return true;
    }

    if (!toggle()) {
      // Non-toggle mode never closes on a repeated trigger press.
      return true;
    }

    if (openEvent && stickIfOpen()) {
      // Preserve hover/focus-opened popups until the matching click-like event closes them.
      return !isClickLikeOpenEvent(openEvent.type);
    }

    // Otherwise, a repeated click toggles the popup closed.
    return false;
  }

  const reference: ElementProps['reference'] = {
    onPointerDown(event: PointerEvent) {
      if (!enabled()) {
        return;
      }
      pointerType = event.pointerType as 'mouse' | 'pen' | 'touch' | undefined;
    },
    onMouseDown(event: MouseEvent) {
      if (!enabled()) {
        return;
      }

      const currentPointerType = pointerType;
      const open = store.state.open;

      // Ignore all buttons except for the "main" button.
      // https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
      if (
        event.button !== 0 ||
        eventOption() === 'click' ||
        (isMouseLikePointerType(currentPointerType, true) && ignoreMouse())
      ) {
        return;
      }

      const nextOpen = getNextOpen(
        open,
        event.currentTarget,
        (openEventType) => openEventType === 'click' || openEventType === 'mousedown',
      );

      // Animations sometimes won't run on a typeable element if using a rAF.
      // Focus is always set on these elements. For touch, we may delay opening.
      const target = getTarget(event);

      if (isTypeableElement(target)) {
        setOpenWithTouchDelay(nextOpen, event, target as HTMLElement, currentPointerType);
        return;
      }

      // Capture the currentTarget before the rAF, since native events don't
      // null it out afterwards the way React does, but the underlying DOM
      // node could still change by the time the frame fires.
      const eventCurrentTarget = event.currentTarget as HTMLElement;

      // Wait until focus is set on the element. This is an alternative to
      // `event.preventDefault()` to avoid :focus-visible from appearing when using a pointer.
      frame.request(() => {
        setOpenWithTouchDelay(nextOpen, event, eventCurrentTarget, currentPointerType);
      });
    },
    onClick(event: MouseEvent) {
      if (!enabled()) {
        return;
      }

      if (eventOption() === 'mousedown-only') {
        return;
      }

      const currentPointerType = pointerType;

      if (eventOption() === 'mousedown' && currentPointerType) {
        pointerType = undefined;
        return;
      }

      if (isMouseLikePointerType(currentPointerType, true) && ignoreMouse()) {
        return;
      }

      const open = store.state.open;
      const nextOpen = getNextOpen(
        open,
        event.currentTarget,
        (openEventType) =>
          openEventType === 'click' ||
          openEventType === 'mousedown' ||
          openEventType === 'keydown' ||
          openEventType === 'keyup',
      );
      setOpenWithTouchDelay(
        nextOpen,
        event,
        event.currentTarget as HTMLElement,
        currentPointerType,
      );
    },
    onKeyDown() {
      if (!enabled()) {
        return;
      }
      pointerType = undefined;
    },
  };

  return { reference };
}
