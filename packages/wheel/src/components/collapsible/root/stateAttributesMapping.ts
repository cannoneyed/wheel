/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { collapsibleOpenStateMapping as baseMapping } from '../collapsibleOpenStateMapping';
import type { CollapsibleRootState } from './CollapsibleRoot';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';

export const collapsibleStateAttributesMapping: StateAttributesMapping<CollapsibleRootState> = {
  ...baseMapping,
  ...transitionStatusMapping,
};
