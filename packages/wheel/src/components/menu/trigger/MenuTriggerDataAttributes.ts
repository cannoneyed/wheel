/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { CommonTriggerDataAttributes } from '../../utils/popupStateMapping';

export enum MenuTriggerDataAttributes {
  /**
   * Present when the corresponding menu is open.
   */
  popupOpen = CommonTriggerDataAttributes.popupOpen,
  /**
   * Present when the trigger is pressed.
   */
  pressed = CommonTriggerDataAttributes.pressed,
}
