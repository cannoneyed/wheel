/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { CommonTriggerDataAttributes } from '../../utils/popupStateMapping';

export enum DrawerTriggerDataAttributes {
  /**
   * Present when the trigger is disabled.
   */
  disabled = 'data-disabled',
  /**
   * Present when the corresponding drawer is open.
   */
  popupOpen = CommonTriggerDataAttributes.popupOpen,
}
