/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { popupStateMapping as baseMapping } from '../../utils/popupStateMapping';
import type { PreviewCardPopupState } from './PreviewCardPopup';

export const previewCardPopupStateAttributesMapping: StateAttributesMapping<
  PreviewCardPopupState
> = {
  ...baseMapping,
  ...transitionStatusMapping,
};
