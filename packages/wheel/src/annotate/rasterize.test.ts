// @vitest-environment jsdom
/**
 * The automatic picture.
 *
 * Pixels used to cost a browser share-prompt, which meant notes arrived
 * without them. Rasterizing the DOM needs no permission, so every note gets a
 * picture — provided this never throws, never blocks a save, and never
 * photographs the annotator that is taking the picture.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { rasterizeRegion } from './rasterize';
import { CHROME_ATTRIBUTE } from '../core/chrome';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('modern-screenshot');
  document.body.innerHTML = '';
});

describe('rasterizeRegion', () => {
  it('refuses a rectangle with no area rather than producing an empty image', async () => {
    expect(await rasterizeRegion({ x: 0, y: 0, width: 0, height: 40 })).toBeNull();
  });

  it('never lets a failed picture take the note down with it', async () => {
    vi.doMock('modern-screenshot', () => ({
      domToDataUrl: () => Promise.reject(new Error('tainted canvas'))
    }));
    const { rasterizeRegion: subject } = await import('./rasterize');

    // A note without pixels is still a note. A save that throws is not.
    expect(await subject({ x: 0, y: 0, width: 100, height: 100 })).toBeNull();
  });

  it('leaves the annotator out of the picture it takes', async () => {
    let filter: ((node: Node) => boolean) | undefined;
    vi.doMock('modern-screenshot', () => ({
      domToDataUrl: (_node: Node, options: { filter?: (node: Node) => boolean }) => {
        filter = options.filter;
        return Promise.resolve('data:image/png;base64,AAA');
      }
    }));
    const { rasterizeRegion: subject } = await import('./rasterize');

    // The attribute comes from the constant, never a copy of it. A literal
    // here is what let the rename slip through: the test and the code both
    // said `data-wheel-annotate-chrome`, agreed with each other, and the real
    // page said something else — so the annotator's own outline went into
    // every screenshot while this passed.
    document.body.innerHTML =
      '<main><p id="app">the thing being annotated</p></main>' +
      `<div ${CHROME_ATTRIBUTE}=""><textarea id="composer"></textarea></div>`;

    expect(await subject({ x: 0, y: 0, width: 100, height: 100 })).toBe('data:image/png;base64,AAA');
    expect(filter).toBeDefined();
    expect(filter!(document.querySelector('#app')!)).toBe(true);
    // Including the composer would put the note's own text in the note's own
    // screenshot.
    expect(filter!(document.querySelector('#composer')!)).toBe(false);
  });
});
