import { hide as nativeHide, type Middleware } from '@floating-ui/dom';

const nativeHideFn = nativeHide().fn;

/**
 * Framework-neutral: ported unchanged from upstream's `hideMiddleware`.
 */
export const hide: Middleware = {
  name: 'hide',
  async fn(state) {
    const { width, height, x, y } = state.rects.reference;
    const anchorHidden = width === 0 && height === 0 && x === 0 && y === 0;
    const nativeHideResult = await nativeHideFn(state);
    return {
      data: {
        referenceHidden: nativeHideResult.data?.referenceHidden || anchorHidden,
      },
    };
  },
};
