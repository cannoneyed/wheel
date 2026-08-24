/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { CommonPopupDataAttributes } from '../../utils/popupStateMapping';

export enum DrawerBackdropDataAttributes {
  /**
   * Present when the drawer is open.
   */
  open = CommonPopupDataAttributes.open,
  /**
   * Present when the drawer is closed.
   */
  closed = CommonPopupDataAttributes.closed,
  /**
   * Present when the drawer begins animating in.
   */
  startingStyle = CommonPopupDataAttributes.startingStyle,
  /**
   * Present when the drawer is animating out.
   */
  endingStyle = CommonPopupDataAttributes.endingStyle,
}
