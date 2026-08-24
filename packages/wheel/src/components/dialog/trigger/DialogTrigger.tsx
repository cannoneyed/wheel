/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useDialogRootContext } from '../root/DialogRootContext';
import { createButton } from '../../internals/use-button/createButton';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { triggerOpenStateMapping } from '../../utils/popupStateMapping';
import { createTriggerDataForwarding } from '../../utils/popups';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { useClick } from '../../floating-ui-solid';
import { createOpenMethodTriggerProps } from '../../utils/useOpenInteractionType';

/**
 * An element to attach the dialog to.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Dialog](https://base-ui.com/react/components/dialog)
 *
 * Deviation: upstream also accepts a `handle` prop for detached triggers (see the `handle`
 * deviation note on `createPopupRootStore`) — not ported, same as `Tooltip.Trigger`.
 */
export function DialogTrigger<Payload = unknown>(
  componentProps: DialogTrigger.Props<Payload>,
): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'payload',
    'disabled',
    'nativeButton',
    'id',
  ]);

  const store = useDialogRootContext();

  const thisTriggerId = createBaseUiId(() => local.id);
  const isOpenedByThisTrigger = store.useState('isOpenedByTrigger', thisTriggerId);
  const popupId = store.useState('triggerPopupId', thisTriggerId);
  const open = store.useState('open');
  const floatingRootContext = store.state.floatingRootContext;

  const triggerElementRef: { current: Element | null } = { current: null };

  const { registerTrigger, isMountedByThisTrigger } = createTriggerDataForwarding(
    thisTriggerId,
    triggerElementRef,
    store,
    () => ({ payload: local.payload }),
  );

  const disabled = () => local.disabled ?? false;
  const nativeButton = () => local.nativeButton ?? true;

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: nativeButton,
  });

  const click = useClick(floatingRootContext);

  const openMethodTriggerProps = createOpenMethodTriggerProps(open, (interactionType) => {
    store.set('openMethod', interactionType);
  });

  const rootTriggerProps = store.useState('triggerProps', isMountedByThisTrigger);

  const state: DialogTrigger.State = {
    get disabled() {
      return disabled();
    },
    get open() {
      return isOpenedByThisTrigger();
    },
  };

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Dialog-Trigger',
    slot: 'dialog-trigger',
    state,
    ref: [
      buttonRef,
      registerTrigger,
      (el: Element | null) => {
        triggerElementRef.current = el;
      },
    ],
    props: [
      click.reference,
      rootTriggerProps,
      openMethodTriggerProps,
      () => ({
        id: thisTriggerId(),
        'aria-haspopup': 'dialog' as const,
        'aria-expanded': isOpenedByThisTrigger(),
        'aria-controls': popupId(),
      }),
      elementProps,
      getButtonProps,
    ],
    stateAttributesMapping: triggerOpenStateMapping,
  });
}

export interface DialogTriggerState {
  /**
   * Whether the trigger is currently disabled.
   */
  disabled: boolean;
  /**
   * Whether the dialog is currently open and was opened by this trigger.
   */
  open: boolean;
}

export interface DialogTriggerProps<Payload = unknown>
  extends NativeButtonProps, BaseUIComponentProps<'button', DialogTriggerState> {
  /**
   * A payload to pass to the dialog when it is opened.
   */
  payload?: Payload | undefined;
  /**
   * ID of the trigger. In addition to being forwarded to the rendered element,
   * it is also used to specify the active trigger for the dialog in controlled mode (with the
   * `Dialog.Root` `triggerId` prop).
   */
  id?: string | undefined;
}

export namespace DialogTrigger {
  export type Props<Payload = unknown> = DialogTriggerProps<Payload>;
  export type State = DialogTriggerState;
}
