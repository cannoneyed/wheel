/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { TransitionStatusDataAttributes } from '../../internals/stateAttributesMapping';

export enum CollapsibleRootDataAttributes {
  /**
   * Present when the collapsible is open.
   */
  open = 'data-open',
  /**
   * Present when the collapsible is closed.
   */
  closed = 'data-closed',
  /**
   * Present when the collapsible begins animating in.
   */
  startingStyle = TransitionStatusDataAttributes.startingStyle,
  /**
   * Present when the collapsible is animating out.
   */
  endingStyle = TransitionStatusDataAttributes.endingStyle,
}
