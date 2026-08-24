/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { CommonPopupDataAttributes } from '../../utils/popupStateMapping';

export enum PreviewCardBackdropDataAttributes {
  /**
   * Present when the preview card is open.
   */
  open = CommonPopupDataAttributes.open,
  /**
   * Present when the preview card is closed.
   */
  closed = CommonPopupDataAttributes.closed,
  /**
   * Present when the preview card begins animating in.
   */
  startingStyle = CommonPopupDataAttributes.startingStyle,
  /**
   * Present when the preview card is animating out.
   */
  endingStyle = CommonPopupDataAttributes.endingStyle,
}
