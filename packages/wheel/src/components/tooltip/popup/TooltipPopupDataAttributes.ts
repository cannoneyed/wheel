/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { CommonPopupDataAttributes } from '../../utils/popupStateMapping';
import { TransitionStatusDataAttributes } from '../../internals/stateAttributesMapping';

export enum TooltipPopupDataAttributes {
  /**
   * Present when the tooltip is open.
   */
  open = CommonPopupDataAttributes.open,
  /**
   * Present when the tooltip is closed.
   */
  closed = CommonPopupDataAttributes.closed,
  /**
   * Present when the tooltip is animating in.
   */
  startingStyle = TransitionStatusDataAttributes.startingStyle,
  /**
   * Present when the tooltip is animating out.
   */
  endingStyle = TransitionStatusDataAttributes.endingStyle,
}
