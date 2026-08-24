/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { popupStateMapping as baseMapping } from '../../utils/popupStateMapping';
import type { TooltipPopupState } from './TooltipPopup';

export const tooltipPopupStateAttributesMapping: StateAttributesMapping<TooltipPopupState> = {
  ...baseMapping,
  ...transitionStatusMapping,
};
