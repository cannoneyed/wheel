/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import { renderDialogRoot, type DialogRoot } from '../../dialog/root/DialogRoot';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';

/**
 * Groups all parts of the alert dialog.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Alert Dialog](https://base-ui.com/react/components/alert-dialog)
 *
 * Deviation: upstream also accepts a `handle` prop and an `actionsRef` — neither is ported, same as
 * `Dialog.Root` (see its doc comment). `AlertDialog.Root` always renders modal, with pointer
 * dismissal (backdrop/outside press) disabled — escape-key dismissal remains enabled, matching
 * upstream's `useRenderDialogRoot('alert-dialog')` exactly (it does not special-case `escapeKey`).
 */
export function AlertDialogRoot<Payload>(props: AlertDialogRoot.Props<Payload>): JSX.Element {
  return renderDialogRoot(props as DialogRoot.Props<Payload>, 'alert-dialog');
}

export interface AlertDialogRootState {}

export interface AlertDialogRootProps<Payload = unknown>
  extends Omit<DialogRoot.Props<Payload>, 'modal' | 'disablePointerDismissal' | 'onOpenChange'> {
  /**
   * Event handler called when the alert dialog is opened or closed.
   */
  onOpenChange?:
    | ((open: boolean, eventDetails: AlertDialogRoot.ChangeEventDetails) => void)
    | undefined;
}

export type AlertDialogRootChangeEventReason = DialogRoot.ChangeEventReason;
export type AlertDialogRootChangeEventDetails =
  BaseUIChangeEventDetails<AlertDialogRootChangeEventReason> & {
    preventUnmountOnClose(): void;
  };

export namespace AlertDialogRoot {
  export type State = AlertDialogRootState;
  export type Props<Payload = unknown> = AlertDialogRootProps<Payload>;
  export type ChangeEventReason = AlertDialogRootChangeEventReason;
  export type ChangeEventDetails = AlertDialogRootChangeEventDetails;
}
