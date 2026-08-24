/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { ImageLoadingStatus } from '../root/AvatarRoot';

export interface CreateImageLoadingStatusOptions {
  referrerPolicy?: Accessor<string | undefined> | undefined;
  crossOrigin?: Accessor<string | null | undefined> | undefined;
  sizes?: Accessor<string | undefined> | undefined;
  srcSet?: Accessor<string | undefined> | undefined;
}

/**
 * Tracks the loading status of an image by loading it out-of-band via a
 * detached `Image` instance (mirroring upstream's probing strategy, which
 * avoids depending on the rendered `<img>` element's own load/error events).
 * Solid port of upstream's `useImageLoadingStatus`.
 */
export function createImageLoadingStatus(
  src: Accessor<string | undefined>,
  options: CreateImageLoadingStatusOptions = {},
): Accessor<ImageLoadingStatus> {
  const [loadingStatus, setLoadingStatus] = createSignal<ImageLoadingStatus>('idle');

  createEffect(() => {
    const srcValue = src();
    const srcSetValue = options.srcSet?.();
    const sizesValue = options.sizes?.();
    const crossOriginValue = options.crossOrigin?.();
    const referrerPolicyValue = options.referrerPolicy?.();

    if (!srcValue && !srcSetValue) {
      setLoadingStatus('error');
      return;
    }

    let isMounted = true;
    const image = new window.Image();

    const updateStatus = (status: ImageLoadingStatus) => () => {
      if (!isMounted) {
        return;
      }

      setLoadingStatus(status);
    };

    setLoadingStatus('loading');
    image.onload = updateStatus('loaded');
    image.onerror = updateStatus('error');
    if (referrerPolicyValue) {
      image.referrerPolicy = referrerPolicyValue as typeof image.referrerPolicy;
    }
    image.crossOrigin = crossOriginValue ?? null;
    if (sizesValue) {
      image.sizes = sizesValue;
    }
    if (srcSetValue) {
      image.srcset = srcSetValue;
    }
    if (srcValue) {
      image.src = srcValue;
    }

    // Fast path for cached/decoded images
    if (image.complete) {
      setLoadingStatus(image.naturalWidth > 0 ? 'loaded' : 'error');
    }

    onCleanup(() => {
      isMounted = false;
    });
  });

  return loadingStatus;
}
