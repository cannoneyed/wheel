/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { CommonPopupDataAttributes } from '../../utils/popupStateMapping';

export enum NavigationMenuBackdropDataAttributes {
  /**
   * Present when the popup is open.
   */
  open = CommonPopupDataAttributes.open,
  /**
   * Present when the popup is closed.
   */
  closed = CommonPopupDataAttributes.closed,
  /**
   * Present when the popup begins animating in.
   */
  startingStyle = CommonPopupDataAttributes.startingStyle,
  /**
   * Present when the popup is animating out.
   */
  endingStyle = CommonPopupDataAttributes.endingStyle,
}
