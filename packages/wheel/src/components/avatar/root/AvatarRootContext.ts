/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { AvatarShape, AvatarSize, AvatarStatus, ImageLoadingStatus } from './AvatarRoot';

export interface AvatarRootContext {
  imageLoadingStatus: Accessor<ImageLoadingStatus>;
  setImageLoadingStatus: (status: ImageLoadingStatus) => void;
  size: Accessor<AvatarSize>;
  shape: Accessor<AvatarShape>;
  status: Accessor<AvatarStatus | undefined>;
}

export const AvatarRootContext = createContext<AvatarRootContext | undefined>(undefined);

export function useAvatarRootContext() {
  const context = useContext(AvatarRootContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: AvatarRootContext is missing. Avatar parts must be placed within <Avatar.Root>.',
    );
  }
  return context;
}
