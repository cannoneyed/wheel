/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { CommonTriggerDataAttributes } from '../../utils/popupStateMapping';

export enum NavigationMenuTriggerDataAttributes {
  /**
   * Present when the corresponding navigation menu is open.
   */
  popupOpen = CommonTriggerDataAttributes.popupOpen,
  /**
   * Present when the trigger is pressed.
   */
  pressed = CommonTriggerDataAttributes.pressed,
}
