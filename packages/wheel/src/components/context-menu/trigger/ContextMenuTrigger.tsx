/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { onCleanup, onMount, splitProps, type JSX } from 'solid-js';
import { addEventListener } from '../../base-utils/addEventListener';
import { ownerDocument } from '../../base-utils/owner';
import { createTimeout } from '../../base-utils/createTimeout';
import { contains, getTarget } from '../../internals/shadowDom';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { useContextMenuRootContext } from '../root/ContextMenuRootContext';
import { useMenuRootContext } from '../../menu/root/MenuRootContext';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { pressableTriggerOpenStateMapping } from '../../utils/popupStateMapping';
import { REASONS } from '../../internals/reasons';

const LONG_PRESS_DELAY = 500;

/**
 * An area that opens the menu on right click or long press.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Context Menu](https://base-ui.com/react/components/context-menu)
 *
 * Deviations from upstream (see also `ContextMenuRoot.tsx`'s doc comment):
 * - Calls `store.setOpen` directly instead of an `actionsRef`-forwarded imperative handle.
 * - No `rootId`/`findRootOwnerId` disambiguation in the post-open document `mouseup` handler — only
 *   the 500ms grace timer and a containment check against the rendered positioner are ported. This
 *   only affects the edge case of a `mouseup` landing inside a *different* nested context menu that
 *   shares a root id; not exercised by the ported test slice.
 */
export function ContextMenuTrigger(componentProps: ContextMenuTrigger.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const contextMenuContext = useContextMenuRootContext(false);
  const { store } = useMenuRootContext(false);

  const open = store.useState('open');
  const disabled = store.useState('disabled');

  let triggerElement: HTMLElement | null = null;
  let touchPosition: { x: number; y: number } | null = null;

  const longPressTimeout = createTimeout();
  const allowMouseUpTimeout = createTimeout();
  let allowMouseUp = false;
  let unsubscribeMouseUp: (() => void) | null = null;

  function handleLongPress(x: number, y: number, event: MouseEvent | TouchEvent) {
    const isTouchEvent = event.type.startsWith('touch');

    contextMenuContext.initialCursorPointRef.current = { x, y };

    contextMenuContext.setAnchor({
      getBoundingClientRect() {
        return DOMRect.fromRect({
          width: isTouchEvent ? 10 : 0,
          height: isTouchEvent ? 10 : 0,
          x,
          y,
        });
      },
    });

    allowMouseUp = false;
    store.setOpen(true, createChangeEventDetails(REASONS.triggerPress, event));

    allowMouseUpTimeout.start(LONG_PRESS_DELAY, () => {
      allowMouseUp = true;
    });
  }

  function handleContextMenu(event: MouseEvent) {
    if (disabled()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleLongPress(event.clientX, event.clientY, event);

    const doc = ownerDocument(triggerElement);

    // Abort a listener from a previous trigger that never saw its mouseup, so only the latest
    // open's listener can cancel it.
    unsubscribeMouseUp?.();

    const unsubscribe = addEventListener(
      doc,
      'mouseup',
      (mouseEvent: MouseEvent) => {
        unsubscribe();
        unsubscribeMouseUp = null;

        if (!allowMouseUp) {
          return;
        }

        allowMouseUpTimeout.clear();
        allowMouseUp = false;

        const mouseUpTarget = getTarget(mouseEvent) as Element | null;

        if (contains(contextMenuContext.positionerRef.current, mouseUpTarget)) {
          return;
        }

        store.setOpen(false, createChangeEventDetails(REASONS.cancelOpen, mouseEvent));
      },
      { once: true },
    );
    unsubscribeMouseUp = unsubscribe;
  }

  function handleTouchStart(event: TouchEvent) {
    if (disabled()) {
      return;
    }
    if (event.touches.length === 1) {
      event.stopPropagation();
      const touch = event.touches[0];
      touchPosition = { x: touch.clientX, y: touch.clientY };
      longPressTimeout.start(LONG_PRESS_DELAY, () => {
        if (touchPosition) {
          handleLongPress(touchPosition.x, touchPosition.y, event);
        }
      });
    }
  }

  function handleTouchMove(event: TouchEvent) {
    if (longPressTimeout.isStarted() && touchPosition && event.touches.length === 1) {
      const touch = event.touches[0];
      const moveThreshold = 10;

      const deltaX = Math.abs(touch.clientX - touchPosition.x);
      const deltaY = Math.abs(touch.clientY - touchPosition.y);

      if (deltaX > moveThreshold || deltaY > moveThreshold) {
        longPressTimeout.clear();
      }
    }
  }

  function handleTouchEnd() {
    longPressTimeout.clear();
    touchPosition = null;
  }

  onCleanup(() => {
    unsubscribeMouseUp?.();
  });

  onMount(() => {
    const doc = ownerDocument(triggerElement);
    const unsubscribe = addEventListener(doc, 'contextmenu', (event: MouseEvent) => {
      if (disabled()) {
        return;
      }

      const target = getTarget(event) as HTMLElement | null;
      if (
        contains(triggerElement, target) ||
        contains(contextMenuContext.internalBackdropRef.current, target) ||
        contains(contextMenuContext.backdropRef.current, target)
      ) {
        event.preventDefault();
      }
    });
    onCleanup(unsubscribe);
  });

  const state: ContextMenuTrigger.State = {
    get open() {
      return open();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-ContextMenu-Trigger',
    slot: 'context-menu-trigger',
    state,
    ref: (el: HTMLElement | null) => {
      triggerElement = el;
    },
    props: [
      {
        onContextMenu: handleContextMenu,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onTouchCancel: handleTouchEnd,
        style: {
          '-webkit-touch-callout': 'none',
        },
      },
      elementProps,
    ],
    stateAttributesMapping: pressableTriggerOpenStateMapping,
  });
}

export interface ContextMenuTriggerState {
  /**
   * Whether the context menu is currently open.
   */
  open: boolean;
}

export interface ContextMenuTriggerProps extends BaseUIComponentProps<'div', ContextMenuTriggerState> {}

export namespace ContextMenuTrigger {
  export type State = ContextMenuTriggerState;
  export type Props = ContextMenuTriggerProps;
}
