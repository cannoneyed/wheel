// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { safePolygon } from './safePolygon';
import type { HandleCloseContext } from './hooks/useHoverShared';

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return this;
    },
  } as DOMRect;
}

function createMouseMoveEvent(
  clientX: number,
  clientY: number,
  target: EventTarget | null = null,
): MouseEvent {
  return {
    type: 'mousemove',
    clientX,
    clientY,
    relatedTarget: null,
    composedPath: () => [target],
  } as unknown as MouseEvent;
}

function createHandleCloseContext(options: {
  domReference: Element;
  floating: HTMLElement;
  onClose: () => void;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  x?: number;
  y?: number;
}): HandleCloseContext {
  const { domReference, floating, onClose, placement = 'bottom', x = 50, y = 100 } = options;

  return {
    x,
    y,
    placement,
    elements: {
      domReference: () => domReference,
      floating: () => floating,
    },
    nodeId: undefined,
    onClose,
    tree: null,
  };
}

describe('safePolygon', () => {
  it('exposes its resolved options on the returned handler', () => {
    const handleClose = safePolygon({ blockPointerEvents: true });
    expect(handleClose.__options).toMatchObject({ blockPointerEvents: true });
  });

  it('calls onClose when the cursor moves directly away from the reference/floating gap', () => {
    const domReference = document.createElement('button');
    const floating = document.createElement('div');
    vi.spyOn(domReference, 'getBoundingClientRect').mockReturnValue(createRect(0, 0, 100, 100));
    vi.spyOn(floating, 'getBoundingClientRect').mockReturnValue(createRect(0, 120, 100, 100));

    const onClose = vi.fn();
    const handleClose = safePolygon();
    const context = createHandleCloseContext({ domReference, floating, onClose, placement: 'bottom' });

    const onMouseMove = handleClose(context);
    onMouseMove(createMouseMoveEvent(50, -50, document.body));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose while the cursor is inside the trough between reference and floating', () => {
    const domReference = document.createElement('button');
    const floating = document.createElement('div');
    vi.spyOn(domReference, 'getBoundingClientRect').mockReturnValue(createRect(0, 0, 100, 100));
    vi.spyOn(floating, 'getBoundingClientRect').mockReturnValue(createRect(0, 120, 100, 100));

    const onClose = vi.fn();
    const handleClose = safePolygon();
    const context = createHandleCloseContext({ domReference, floating, onClose, placement: 'bottom' });

    const onMouseMove = handleClose(context);
    // (50, 110) sits in the gap between the reference's bottom (100) and the
    // floating element's top (120): traversing back and forth here must not
    // close the floating element.
    onMouseMove(createMouseMoveEvent(50, 110, document.body));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose while the target is over the floating element itself', () => {
    const domReference = document.createElement('button');
    const floating = document.createElement('div');
    document.body.append(domReference, floating);
    vi.spyOn(domReference, 'getBoundingClientRect').mockReturnValue(createRect(0, 0, 100, 100));
    vi.spyOn(floating, 'getBoundingClientRect').mockReturnValue(createRect(0, 120, 100, 100));

    const onClose = vi.fn();
    const handleClose = safePolygon();
    const context = createHandleCloseContext({ domReference, floating, onClose, placement: 'bottom' });

    const onMouseMove = handleClose(context);
    onMouseMove(createMouseMoveEvent(50, 150, floating));

    expect(onClose).not.toHaveBeenCalled();

    domReference.remove();
    floating.remove();
  });
});
