/**
 * Pixels for a note, taken from the DOM rather than from the screen.
 *
 * The obvious way to screenshot a page is `getDisplayMedia`, which is what the
 * debug panel's rich screenshots use. It has one fatal property for THIS
 * feature: it opens a browser share-picker every session. A screenshot that
 * costs a modal is a screenshot nobody takes, and pixels are the one thing
 * every note should carry.
 *
 * So a note rasterizes its own rectangle instead: the DOM is serialized into an
 * SVG `foreignObject` and decoded as an image, which needs no permission and no
 * prompt. It is not a perfect copy of the screen — see the caveats below — but
 * it is automatic, and an imperfect picture on every note beats a perfect one
 * on none.
 *
 * **What it cannot see.** Cross-origin iframes, `<canvas>` and `<video>`
 * contents, and anything drawn by the compositor rather than by CSS. For those,
 * and for anything moving, `getDisplayMedia` is still the answer — which is why
 * the 🎥 switch remains.
 *
 * **Why it is not the video source.** Serializing a subtree costs tens to
 * hundreds of milliseconds ON THE MAIN THREAD — the same thread the app being
 * debugged runs on. Sampling it per frame would stutter the app and change the
 * behaviour under observation, which is the one thing a debugging tool must not
 * do. Motion comes from the compositor (`getDisplayMedia`) or not at all.
 *
 * The library is loaded with a dynamic `import()`, so it reaches the browser
 * only when someone actually writes a note.
 */
import { logger } from '../core/logger';

import type { NoteRect } from './types';

/** Attribute marking the annotator's own overlays, which never belong in a shot. */
const CHROME_SELECTOR = '[data-wheel-annotate-chrome]';

/** Cap on the rasterized image, so a full-page rectangle cannot produce a 20 MB data URL. */
const MAX_PIXELS = 2_000;

/**
 * Rasterize one viewport rectangle to a PNG data URL, or null if it cannot be
 * done here.
 *
 * Never throws: a note without pixels is still a note, and a rasterizer that
 * took the whole save down with it would be a worse bug than a missing image.
 */
export async function rasterizeRegion(rect: NoteRect): Promise<string | null> {
  if (typeof document === 'undefined' || rect.width < 1 || rect.height < 1) return null;
  try {
    const { domToDataUrl } = await import('modern-screenshot');
    const ratio = globalThis.devicePixelRatio ?? 1;
    const scale = Math.min(ratio, MAX_PIXELS / Math.max(rect.width, rect.height));
    return await domToDataUrl(document.documentElement, {
      // The rectangle is viewport-relative, and the source is the document, so
      // the crop has to be offset by however far the page is scrolled.
      width: rect.width,
      height: rect.height,
      style: {
        transform: `translate(${-(rect.x + (globalThis.scrollX ?? 0))}px, ${-(rect.y + (globalThis.scrollY ?? 0))}px)`,
        transformOrigin: 'top left'
      },
      scale: Math.max(scale, 1),
      // The annotator is not part of the app it photographs.
      filter: (node) => !(node instanceof Element && node.closest(CHROME_SELECTOR))
    });
  } catch (error) {
    logger.warn('wheel: annotate could not rasterize the region', error);
    return null;
  }
}
