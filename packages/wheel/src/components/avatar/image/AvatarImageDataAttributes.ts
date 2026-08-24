/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { TransitionStatusDataAttributes } from '../../internals/stateAttributesMapping';

export enum AvatarImageDataAttributes {
  /**
   * Present when the image begins animating in.
   */
  startingStyle = TransitionStatusDataAttributes.startingStyle,
  /**
   * Present when the image is animating out.
   */
  endingStyle = TransitionStatusDataAttributes.endingStyle,
}
