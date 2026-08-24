/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createSignal, splitProps } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { AvatarRootContext } from './AvatarRootContext';
import { avatarStateAttributesMapping } from '../stateAttributesMapping';

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
  ]);

  const [imageLoadingStatus, setImageLoadingStatus] = createSignal<ImageLoadingStatus>('idle');

  const state: AvatarRoot.State = {
    get imageLoadingStatus() {
      return imageLoadingStatus();
    },
  };

  return (
    <AvatarRootContext.Provider value={{ imageLoadingStatus, setImageLoadingStatus }}>
      {renderElement('span', componentProps, {
        defaultClass: 'wheel-Avatar-Root',
        slot: 'avatar-root',
        state,
        props: [elementProps as Record<string, any>],
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
}

export interface AvatarRootProps extends BaseUIComponentProps<'span', AvatarRootState> {}

export namespace AvatarRoot {
  export type State = AvatarRootState;
  export type Props = AvatarRootProps;
}
