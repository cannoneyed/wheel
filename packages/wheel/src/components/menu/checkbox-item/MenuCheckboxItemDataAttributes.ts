/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { TransitionStatusDataAttributes } from '../../internals/stateAttributesMapping';

export enum MenuCheckboxItemDataAttributes {
  /**
   * Present when the item is checked.
   */
  checked = 'data-checked',
  /**
   * Present when the item is not checked.
   */
  unchecked = 'data-unchecked',
  /**
   * Present when the item is disabled.
   */
  disabled = 'data-disabled',
  /**
   * Present when the item is highlighted.
   */
  highlighted = 'data-highlighted',
  /**
   * Present when the item begins animating in.
   */
  startingStyle = TransitionStatusDataAttributes.startingStyle,
  /**
   * Present when the item is animating out.
   */
  endingStyle = TransitionStatusDataAttributes.endingStyle,
}
