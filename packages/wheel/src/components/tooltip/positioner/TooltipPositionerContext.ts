/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { UseAnchorPositioningReturnValue } from '../../utils/useAnchorPositioning';

export type TooltipPositionerContext = Pick<
  UseAnchorPositioningReturnValue,
  'side' | 'align' | 'setArrowElement' | 'arrowUncentered' | 'arrowStyles'
>;

export const TooltipPositionerContext = createContext<TooltipPositionerContext | undefined>(
  undefined,
);

export function useTooltipPositionerContext(): TooltipPositionerContext {
  const context = useContext(TooltipPositionerContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: TooltipPositionerContext is missing. TooltipPositioner parts must be placed within <Tooltip.Positioner>.',
    );
  }
  return context;
}
