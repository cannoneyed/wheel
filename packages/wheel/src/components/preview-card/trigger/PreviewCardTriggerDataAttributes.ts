/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { CommonTriggerDataAttributes } from '../../utils/popupStateMapping';

export enum PreviewCardTriggerDataAttributes {
  /**
   * Present when the corresponding preview card is open.
   */
  popupOpen = CommonTriggerDataAttributes.popupOpen,
}
