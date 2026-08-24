/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { UseAnchorPositioningReturnValue } from '../../utils/useAnchorPositioning';

/**
 * Solid port of upstream's `ComboboxPositionerContext`.
 */
export type ComboboxPositionerContext = Pick<
  UseAnchorPositioningReturnValue,
  'side' | 'align' | 'arrowStyles' | 'setArrowElement' | 'arrowUncentered' | 'anchorHidden' | 'isPositioned'
>;

export const ComboboxPositionerContext = createContext<ComboboxPositionerContext | undefined>(
  undefined,
);

export function useComboboxPositionerContext(): ComboboxPositionerContext;
export function useComboboxPositionerContext(optional: true): ComboboxPositionerContext | undefined;
export function useComboboxPositionerContext(optional?: boolean) {
  const context = useContext(ComboboxPositionerContext);
  if (context === undefined && !optional) {
    throw new Error(
      'Base UI: <Combobox.Popup> and <Combobox.Arrow> must be used within the <Combobox.Positioner> component',
    );
  }
  return context;
}
