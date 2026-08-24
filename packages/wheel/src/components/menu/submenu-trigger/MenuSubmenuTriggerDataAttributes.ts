/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { CommonTriggerDataAttributes } from '../../utils/popupStateMapping';

export enum MenuSubmenuTriggerDataAttributes {
  /**
   * Present when the submenu is open.
   */
  popupOpen = CommonTriggerDataAttributes.popupOpen,
  /**
   * Present when the trigger is highlighted.
   */
  highlighted = 'data-highlighted',
  /**
   * Present when the trigger is disabled.
   */
  disabled = 'data-disabled',
}
