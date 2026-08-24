/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { UseAnchorPositioningReturnValue } from '../../utils/useAnchorPositioning';

export type PopoverPositionerContext = Pick<
  UseAnchorPositioningReturnValue,
  'side' | 'align' | 'setArrowElement' | 'arrowUncentered' | 'arrowStyles'
>;

export const PopoverPositionerContext = createContext<PopoverPositionerContext | undefined>(
  undefined,
);

export function usePopoverPositionerContext(): PopoverPositionerContext {
  const context = useContext(PopoverPositionerContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: PopoverPositionerContext is missing. PopoverPositioner parts must be placed within <Popover.Positioner>.',
    );
  }
  return context;
}
