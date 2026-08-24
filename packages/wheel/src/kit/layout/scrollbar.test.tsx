// @vitest-environment jsdom
/**
 * The scrollbar's sizing rules are pure math in `thumbGeometry`; jsdom has no
 * layout, so the component render here is a lifecycle smoke test and the real
 * drag/page/resize behavior lives in the demos Chromium spec.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';

import { Scrollbar, thumbGeometry } from './scrollbar';

describe('thumbGeometry', () => {
  it('is null when nothing overflows or the track is unmeasured', () => {
    expect(
      thumbGeometry(200, { viewport: 500, content: 500, offset: 0 })
    ).toBeNull();
    expect(
      thumbGeometry(200, { viewport: 500, content: 480, offset: 0 })
    ).toBeNull();
    expect(
      thumbGeometry(0, { viewport: 500, content: 1000, offset: 0 })
    ).toBeNull();
  });

  it('sizes the thumb as the visible fraction of the track', () => {
    const shape = thumbGeometry(200, { viewport: 500, content: 1000, offset: 0 });
    expect(shape).toEqual({ size: 100, offset: 0 });
  });

  it('positions the thumb by the scrolled fraction of the remaining track', () => {
    const halfway = thumbGeometry(200, {
      viewport: 500,
      content: 1000,
      offset: 250
    });
    expect(halfway).toEqual({ size: 100, offset: 50 });
    const end = thumbGeometry(200, { viewport: 500, content: 1000, offset: 500 });
    expect(end).toEqual({ size: 100, offset: 100 });
  });

  it('clamps a tiny thumb to the usable minimum and reaches the track end', () => {
    const shape = thumbGeometry(200, {
      viewport: 100,
      content: 10_000,
      offset: 9_900
    });
    expect(shape?.size).toBe(24);
    expect(shape?.offset).toBeCloseTo(176, 5);
  });
});

describe('Scrollbar component', () => {
  it('mounts hidden without overflow and cleans up its listeners', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dispose = render(
      () => <Scrollbar container={() => container} axis="x" label="Test bar" />,
      host
    );
    const bar = host.querySelector('[data-wheel-scrollbar]') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.style.display).toBe('none');
    expect(bar.tabIndex).toBe(-1);
    expect(bar.getAttribute('aria-label')).toBe('Test bar');
    dispose();
    container.remove();
    host.remove();
  });
});
