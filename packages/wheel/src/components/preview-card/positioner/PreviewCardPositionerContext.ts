/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { UseAnchorPositioningReturnValue } from '../../utils/useAnchorPositioning';

export type PreviewCardPositionerContext = Pick<
  UseAnchorPositioningReturnValue,
  'side' | 'align' | 'setArrowElement' | 'arrowUncentered' | 'arrowStyles'
>;

export const PreviewCardPositionerContext = createContext<
  PreviewCardPositionerContext | undefined
>(undefined);

export function usePreviewCardPositionerContext(): PreviewCardPositionerContext {
  const context = useContext(PreviewCardPositionerContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: PreviewCardPositionerContext is missing. PreviewCardPositioner parts must be placed within <PreviewCard.Positioner>.',
    );
  }
  return context;
}
