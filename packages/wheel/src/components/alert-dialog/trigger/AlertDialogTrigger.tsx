/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import {
  DialogTrigger,
  type DialogTriggerProps,
  type DialogTriggerState,
} from '../../dialog/trigger/DialogTrigger';

/**
 * A button that opens the alert dialog.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Alert Dialog](https://base-ui.com/react/components/alert-dialog)
 */
export const AlertDialogTrigger = DialogTrigger as AlertDialogTrigger;

export interface AlertDialogTrigger {
  <Payload>(componentProps: AlertDialogTriggerProps<Payload>): JSX.Element;
}

export interface AlertDialogTriggerProps<Payload = unknown> extends DialogTriggerProps<Payload> {}

export interface AlertDialogTriggerState extends DialogTriggerState {}

export namespace AlertDialogTrigger {
  export type Props<Payload = unknown> = AlertDialogTriggerProps<Payload>;
  export type State = AlertDialogTriggerState;
}
