/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import { DialogStore } from '../store/DialogStore';

export type DialogRootContext<Payload = unknown> = DialogStore<Payload>;

export const DialogRootContext = createContext<DialogRootContext | undefined>(undefined);

export function useDialogRootContext(optional?: false): DialogRootContext;
export function useDialogRootContext(optional: true): DialogRootContext | undefined;
export function useDialogRootContext(optional?: boolean) {
  const context = useContext(DialogRootContext);

  if (context === undefined && !optional) {
    throw new Error(
      'Base UI: DialogRootContext is missing. Dialog parts must be placed within <Dialog.Root>.',
    );
  }

  return context;
}
