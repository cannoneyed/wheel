/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createSignal, splitProps } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { AvatarRootContext } from './AvatarRootContext';
import { avatarStateAttributesMapping } from '../stateAttributesMapping';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'circle' | 'rounded' | 'square';

/**
 * Displays a user's profile picture, initials, or fallback icon.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Avatar](https://base-ui.com/react/components/avatar)
 */
export function AvatarRoot(componentProps: AvatarRoot.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'size',
    'shape',
  ]);

  const [imageLoadingStatus, setImageLoadingStatus] = createSignal<ImageLoadingStatus>('idle');
  const size = (): AvatarSize => componentProps.size ?? 'md';
  const shape = (): AvatarShape => componentProps.shape ?? 'circle';

  const state: AvatarRoot.State = {
    get imageLoadingStatus() {
      return imageLoadingStatus();
    },
    get size() {
      return size();
    },
    get shape() {
      return shape();
    },
  };

  return (
    <AvatarRootContext.Provider value={{ imageLoadingStatus, setImageLoadingStatus, size, shape }}>
      {renderElement('span', componentProps, {
        defaultClass: 'wheel-Avatar-Root',
        slot: 'avatar-root',
        state,
        props: [
          () => ({ 'data-size': size(), 'data-shape': shape() }),
          elementProps as Record<string, any>,
        ],
        stateAttributesMapping: avatarStateAttributesMapping,
      })}
    </AvatarRootContext.Provider>
  );
}

export type ImageLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface AvatarRootState {
  /**
   * The image loading status.
   */
  imageLoadingStatus: ImageLoadingStatus;
  size: AvatarSize;
  shape: AvatarShape;
}

export interface AvatarRootProps extends BaseUIComponentProps<'span', AvatarRootState> {
  /** Identity size. @default 'md' */
  size?: AvatarSize | undefined;
  /** Clipping shape. @default 'circle' */
  shape?: AvatarShape | undefined;
}

export namespace AvatarRoot {
  export type State = AvatarRootState;
  export type Props = AvatarRootProps;
}
