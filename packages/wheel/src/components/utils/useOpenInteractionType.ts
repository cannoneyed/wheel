import { createEffect, createSignal, on, type Accessor } from 'solid-js';
import { platform } from '../base-utils/platform/index';
import type { InteractionType } from '../floating-ui-solid/components/FloatingFocusManager';
import type { HTMLProps } from '../internals/types';

/**
 * Builds the `onPointerDown`/`onClick` trigger props that compute which interaction type
 * (keyboard, mouse, touch, etc.) opened a component, forwarding the result to `setOpenMethod`.
 * Solid port of upstream's `useOpenMethodTriggerProps`, for callers (e.g. `Dialog.Trigger`) that
 * store `openMethod` in a shared store rather than component-local state.
 *
 * Deviation: upstream's `useEnhancedClickHandler` distinguishes `PointerEvent`/`MouseEvent`
 * shapes across browsers that don't dispatch a `PointerEvent` to click handlers (older Safari/
 * Firefox). This port reads `event.detail === 0` (keyboard activation) the same way, and falls
 * back to the pointer type recorded on the immediately preceding `pointerdown`, covering the
 * same cases with plain event listeners instead of a dedicated hook.
 */
export function createOpenMethodTriggerProps(
  open: Accessor<boolean>,
  setOpenMethod: (interactionType: InteractionType | null) => void,
): HTMLProps {
  let lastPointerType: InteractionType | '' = '';

  function handleOpenMethod(interactionType: InteractionType | '') {
    if (!open()) {
      setOpenMethod(
        interactionType ||
          // On iOS Safari, the hitslop around touch targets means tapping outside an element's
          // bounds does not fire `pointerdown` but does fire `mousedown`. The `interactionType`
          // will be "" in that case.
          (platform.os.ios ? 'touch' : ''),
      );
    }
  }

  return {
    onPointerDown(event: PointerEvent) {
      if (event.defaultPrevented) {
        return;
      }
      lastPointerType = (event.pointerType as InteractionType) || '';
      handleOpenMethod(lastPointerType);
    },
    onClick(event: MouseEvent) {
      if (event.detail === 0) {
        handleOpenMethod('keyboard');
        return;
      }

      if ('pointerType' in event) {
        handleOpenMethod(((event as PointerEvent).pointerType as InteractionType) || '');
      } else {
        handleOpenMethod(lastPointerType);
      }
      lastPointerType = '';
    },
  };
}

/**
 * Determines the interaction type (keyboard, mouse, touch, etc.) that opened a component.
 * Solid port of upstream's `useOpenInteractionType`, for callers (e.g. `Menu.Root`/`Select.Root`)
 * that don't have a shared store field to track `openMethod` in, so it's kept as local state.
 */
export function createOpenInteractionType(
  open: Accessor<boolean>,
): { openMethod: Accessor<InteractionType | null>; triggerProps: HTMLProps } {
  const [openMethod, setOpenMethod] = createSignal<InteractionType | null>(null);

  const triggerProps = createOpenMethodTriggerProps(open, setOpenMethod);

  let previousOpen = open();
  createEffect(
    on(open, (isOpen) => {
      if (previousOpen && !isOpen) {
        setOpenMethod(null);
      }
      previousOpen = isOpen;
    }),
  );

  return { openMethod, triggerProps };
}
