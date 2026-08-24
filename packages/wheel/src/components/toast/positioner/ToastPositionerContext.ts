/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { UseAnchorPositioningReturnValue } from '../../utils/useAnchorPositioning';

export type ToastPositionerContext = Pick<
  UseAnchorPositioningReturnValue,
  'side' | 'align' | 'setArrowElement' | 'arrowUncentered' | 'arrowStyles'
>;

export const ToastPositionerContext = createContext<ToastPositionerContext | undefined>(undefined);

export function useToastPositionerContext(): ToastPositionerContext {
  const context = useContext(ToastPositionerContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: ToastPositionerContext is missing. ToastPositioner parts must be placed within <Toast.Positioner>.',
    );
  }
  return context;
}
