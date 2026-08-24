/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { StateAttributesMapping } from '../internals/getStateAttributesProps';
import type { AvatarRootState } from './root/AvatarRoot';

export const avatarStateAttributesMapping: StateAttributesMapping<AvatarRootState> = {
  imageLoadingStatus: () => null,
};
