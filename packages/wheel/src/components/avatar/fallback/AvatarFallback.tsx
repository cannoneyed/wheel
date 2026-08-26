/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, createSignal, onCleanup, splitProps } from 'solid-js';
import { createTimeout } from '../../base-utils/createTimeout';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { useAvatarRootContext } from '../root/AvatarRootContext';
import type { AvatarRootState } from '../root/AvatarRoot';
import { avatarStateAttributesMapping } from '../stateAttributesMapping';

/**
 * Rendered when the image fails to load or when no image is provided.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Avatar](https://base-ui.com/react/components/avatar)
 */
export function AvatarFallback(componentProps: AvatarFallback.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'delay',
  ]);

  const delay = () => componentProps.delay ?? 0;

  const { imageLoadingStatus, size, shape, status } = useAvatarRootContext();
  const [delayPassed, setDelayPassed] = createSignal(delay() === 0);
  const timeout = createTimeout();

  createEffect(() => {
    const currentDelay = delay();
    if (currentDelay > 0) {
      timeout.start(currentDelay, () => setDelayPassed(true));
    } else {
      // Once the fallback is shown without a delay, keep it visible. Otherwise a later
      // change from no delay to a number would re-hide an already-visible fallback.
      setDelayPassed(true);
    }
    onCleanup(timeout.clear);
  });

  const state: AvatarFallback.State = {
    get imageLoadingStatus() {
      return imageLoadingStatus();
    },
    get size() {
      return size();
    },
    get shape() {
      return shape();
    },
    get status() {
      return status();
    },
  };

  const enabled = () => imageLoadingStatus() !== 'loaded' && (delay() === 0 || delayPassed());

  return renderElement('span', componentProps, {
    defaultClass: 'wheel-Avatar-Fallback',
    slot: 'avatar-fallback',
    state,
    props: [
      () => ({ 'data-size': size(), 'data-shape': shape(), 'data-status': status() }),
      elementProps as Record<string, any>,
    ],
    stateAttributesMapping: avatarStateAttributesMapping,
    enabled,
  });
}

export interface AvatarFallbackState extends AvatarRootState {}

export interface AvatarFallbackProps extends BaseUIComponentProps<'span', AvatarFallbackState> {
  /**
   * How long to wait before showing the fallback. Specified in milliseconds.
   *
   * @default 0
   */
  delay?: number | undefined;
}

export namespace AvatarFallback {
  export type State = AvatarFallbackState;
  export type Props = AvatarFallbackProps;
}
