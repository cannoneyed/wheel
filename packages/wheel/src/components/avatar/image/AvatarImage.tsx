/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { createTransitionStatus, type TransitionStatus } from '../../internals/createTransitionStatus';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { useAvatarRootContext } from '../root/AvatarRootContext';
import type { AvatarRootState, ImageLoadingStatus } from '../root/AvatarRoot';
import { avatarStateAttributesMapping } from '../stateAttributesMapping';
import { createImageLoadingStatus } from './createImageLoadingStatus';

const stateAttributesMapping: StateAttributesMapping<AvatarImageState> = {
  ...avatarStateAttributesMapping,
  ...transitionStatusMapping,
};

/**
 * The image to be displayed in the avatar.
 * Renders an `<img>` element.
 *
 * Documentation: [Base UI Avatar](https://base-ui.com/react/components/avatar)
 */
export function AvatarImage(componentProps: AvatarImage.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'onLoadingStatusChange',
  ]);

  const { setImageLoadingStatus } = useAvatarRootContext();

  const imageLoadingStatus = createImageLoadingStatus(
    () => componentProps.src as string | undefined,
    {
      referrerPolicy: () => componentProps.referrerPolicy as string | undefined,
      crossOrigin: () => componentProps.crossOrigin as string | null | undefined,
      sizes: () => componentProps.sizes as string | undefined,
      srcSet: () => componentProps.srcSet as string | undefined,
    },
  );

  const isVisible = () => imageLoadingStatus() === 'loaded';
  const { mounted, transitionStatus, setMounted } = createTransitionStatus(isVisible);

  let imageRef: HTMLImageElement | null = null;

  createEffect(() => {
    const status = imageLoadingStatus();
    if (status !== 'idle') {
      componentProps.onLoadingStatusChange?.(status);
      setImageLoadingStatus(status);
    }
  });

  onCleanup(() => {
    setImageLoadingStatus('idle');
  });

  createOpenChangeComplete({
    open: isVisible,
    getElement: () => imageRef,
    onComplete() {
      if (!isVisible()) {
        setMounted(false);
      }
    },
  });

  const state: AvatarImage.State = {
    get imageLoadingStatus() {
      return imageLoadingStatus();
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  return renderElement('img', componentProps, {
    defaultClass: 'wheel-Avatar-Image',
    slot: 'avatar-image',
    state,
    ref: (el: HTMLImageElement) => {
      imageRef = el;
    },
    props: [elementProps as Record<string, any>],
    stateAttributesMapping,
    enabled: mounted,
  });
}

export interface AvatarImageState extends AvatarRootState {
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface AvatarImageProps extends BaseUIComponentProps<'img', AvatarImageState> {
  /**
   * Callback fired when the loading status changes.
   */
  onLoadingStatusChange?: ((status: ImageLoadingStatus) => void) | undefined;
}

export namespace AvatarImage {
  export type State = AvatarImageState;
  export type Props = AvatarImageProps;
}
