// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { MiddlewareState } from '@floating-ui/dom';
import { arrow, baseArrow } from './arrow';

function createState(element: Element | null): MiddlewareState {
  return {
    x: 0,
    y: 0,
    initialPlacement: 'top',
    placement: 'top',
    strategy: 'absolute',
    middlewareData: {},
    rects: {
      reference: { x: 0, y: 0, width: 100, height: 40 },
      floating: { x: 0, y: -50, width: 60, height: 30 },
    },
    elements: {
      reference: {} as Element,
      floating: { clientWidth: 60, clientHeight: 30 } as unknown as HTMLElement,
    },
    platform: {
      getDimensions: async () => ({ width: 10, height: 10 }),
      getOffsetParent: async () => undefined,
      isElement: async () => false,
    } as any,
  };
}

describe('arrow middleware', () => {
  it('returns a middleware object named "arrow"', () => {
    const middleware = baseArrow({ element: null });
    expect(middleware.name).toBe('arrow');
    expect(typeof middleware.fn).toBe('function');
  });

  it('`arrow` is an alias of `baseArrow` (no React-only deps hint needed in Solid)', () => {
    expect(arrow).toBe(baseArrow);
  });

  it('resolves to no-op data when the element is null/undefined', async () => {
    const middleware = baseArrow({ element: null });
    const result = await middleware.fn(createState(null));
    expect(result).toEqual({});
  });

  it('computes centered arrow data from a `{ current }` ref-like element', async () => {
    const arrowEl = document.createElement('div');
    const middleware = baseArrow({ element: { current: arrowEl } });
    const result = await middleware.fn(createState(arrowEl));

    expect(result.x).toBe(0);
    expect(result.reset).toBe(false);
    expect(result.data?.x).toBe(45);
    expect(result.data?.centerOffset).toBe(0);
  });

  it('computes the same arrow data from an accessor element', async () => {
    const arrowEl = document.createElement('div');
    const middleware = baseArrow({ element: () => arrowEl });
    const result = await middleware.fn(createState(arrowEl));

    expect(result.data?.x).toBe(45);
    expect(result.data?.centerOffset).toBe(0);
  });

  it('computes the same arrow data from a raw element', async () => {
    const arrowEl = document.createElement('div');
    const middleware = baseArrow({ element: arrowEl });
    const result = await middleware.fn(createState(arrowEl));

    expect(result.data?.x).toBe(45);
  });

  it('supports a `Derivable` options function', async () => {
    const arrowEl = document.createElement('div');
    const middleware = baseArrow((state) => ({
      element: arrowEl,
      padding: state.rects.reference.width > 0 ? 0 : 100,
    }));
    const result = await middleware.fn(createState(arrowEl));

    expect(result.data?.x).toBe(45);
  });
});
