/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { isHTMLElement } from '@floating-ui/utils/dom';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import { usePopoverPositionerContext } from '../positioner/PopoverPositionerContext';
import type { Side, Align } from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { renderElement } from '../../internals/renderElement';
import { getDisabledMountTransitionStyles } from '../../utils/getDisabledMountTransitionStyles';
import { useHoverFloatingInteraction } from '../../floating-ui-solid';
import {
  FloatingFocusManager,
  type InteractionType,
} from '../../floating-ui-solid/components/FloatingFocusManager';
import { REASONS } from '../../internals/reasons';
import { createDefaultInitialFocus, FOCUSABLE_POPUP_PROPS } from '../../utils/popups';
import { ClosePartProvider, createClosePartCount } from '../../utils/closePart';
import { popoverPopupStateAttributesMapping } from './stateAttributesMapping';

/**
 * A container for the popover contents.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 *
 * Deviation: upstream stops propagation of composite-navigation keydowns when nested inside a
 * `Toolbar`. Not ported — `Toolbar` hasn't been ported to this package yet.
 */
export function PopoverPopup(componentProps: PopoverPopup.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'initialFocus',
    'finalFocus',
  ]);

  const store = usePopoverRootContext();
  const positioner = usePopoverPositionerContext();
  const { context: closePartContext, hasClosePart } = createClosePartCount();

  const open = store.useState('open');
  const openMethod = store.useState('openMethod');
  const instantType = store.useState('instantType');
  const transitionStatus = store.useState('transitionStatus');
  const popupProps = store.useState('popupProps');
  const titleId = store.useState('titleElementId');
  const descriptionId = store.useState('descriptionElementId');
  const modal = store.useState('modal');
  const mounted = store.useState('mounted');
  const openReason = store.useState('openChangeReason');
  const activeTriggerElement = store.useState('activeTriggerElement');
  const floatingContext = store.state.floatingRootContext;
  const floatingId = floatingContext.useState('floatingId');
  const disabled = store.useState('disabled');
  const openOnHover = store.useState('openOnHover');
  const closeDelay = store.useState('closeDelay');

  let popupElement: HTMLElement | null = null;

  createOpenChangeComplete({
    open,
    getElement: () => popupElement,
    onComplete() {
      if (open()) {
        store.context.onOpenChangeComplete?.(true);
      }
    },
  });

  useHoverFloatingInteraction(floatingContext, {
    enabled: () => openOnHover() && !disabled(),
    closeDelay,
  });

  const resolvedInitialFocus =
    local.initialFocus === undefined
      ? createDefaultInitialFocus(() => popupElement)
      : local.initialFocus;

  const focusManagerModal = () => modal() !== false && hasClosePart();
  store.syncValue('focusManagerModal', focusManagerModal);

  const state: PopoverPopup.State = {
    get open() {
      return open();
    },
    get side() {
      return positioner.side();
    },
    get align() {
      return positioner.align();
    },
    get instant() {
      return instantType();
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  return (
    <FloatingFocusManager
      context={floatingContext}
      openInteractionType={openMethod()}
      modal={focusManagerModal()}
      disabled={!mounted() || openReason() === REASONS.triggerHover}
      initialFocus={resolvedInitialFocus}
      returnFocus={local.finalFocus}
      restoreFocus="popup"
      previousFocusableElement={
        isHTMLElement(activeTriggerElement()) ? (activeTriggerElement() as HTMLElement) : undefined
      }
      nextFocusableElement={store.context.triggerFocusTargetRef}
      beforeContentFocusGuardRef={(el) => {
        store.context.beforeContentFocusGuardRef.current = el;
      }}
    >
      <ClosePartProvider value={closePartContext}>
        {renderElement('div', componentProps, {
          defaultClass: 'wheel-Popover-Popup',
          slot: 'popover-popup',
          state,
          ref: (el: HTMLElement | null) => {
            popupElement = el;
            store.set('popupElement', el);
          },
          props: [
            popupProps,
            () => ({
              id: floatingId(),
              role: 'dialog',
              ...FOCUSABLE_POPUP_PROPS,
              'aria-labelledby': titleId(),
              'aria-describedby': descriptionId(),
            }),
            () => getDisabledMountTransitionStyles(transitionStatus()),
            elementProps,
          ],
          stateAttributesMapping: popoverPopupStateAttributesMapping,
        })}
      </ClosePartProvider>
    </FloatingFocusManager>
  );
}

export interface PopoverPopupState {
  /**
   * Whether the popover is currently open.
   */
  open: boolean;
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side;
  /**
   * The alignment of the component relative to the anchor.
   */
  align: Align;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
  /**
   * Whether transitions should be skipped.
   */
  instant: 'dismiss' | 'click' | 'focus' | undefined;
}

export interface PopoverPopupProps extends BaseUIComponentProps<'div', PopoverPopupState> {
  /**
   * Determines the element to focus when the popover is opened.
   * By default, focus moves to the first tabbable element inside the popup.
   *
   * - `false`: Do not move focus.
   * - `true`: Move focus based on the default behavior (first tabbable element or popup).
   * - a `{ current }` box: Move focus to the boxed element.
   * - `function`: Called with the interaction type. Return an element to focus, `true` to use the
   *   default behavior, `null` to fall back to the default behavior, or `false`/`undefined` to do
   *   nothing.
   */
  initialFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((openType: InteractionType) => void | boolean | HTMLElement | null)
    | undefined;
  /**
   * Determines the element to focus when the popover is closed.
   *
   * - `false`: Do not move focus.
   * - `true`: Move focus based on the default behavior (trigger or previously focused element).
   * - a `{ current }` box: Move focus to the boxed element.
   * - `function`: Called with the interaction type. Return an element to focus, `true` to use the
   *   default behavior, `null` to fall back to the default behavior, or `false`/`undefined` to do
   *   nothing.
   */
  finalFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((closeType: InteractionType) => void | boolean | HTMLElement | null)
    | undefined;
}

export namespace PopoverPopup {
  export type State = PopoverPopupState;
  export type Props = PopoverPopupProps;
}
