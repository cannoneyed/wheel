/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { CommonPopupDataAttributes } from '../../utils/popupStateMapping';

export enum DialogBackdropDataAttributes {
  /**
   * Present when the dialog is open.
   */
  open = CommonPopupDataAttributes.open,
  /**
   * Present when the dialog is closed.
   */
  closed = CommonPopupDataAttributes.closed,
  /**
   * Present when the dialog begins animating in.
   */
  startingStyle = CommonPopupDataAttributes.startingStyle,
  /**
   * Present when the dialog is animating out.
   */
  endingStyle = CommonPopupDataAttributes.endingStyle,
}
