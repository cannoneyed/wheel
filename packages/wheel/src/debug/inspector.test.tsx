// @vitest-environment jsdom
/**
 * The inspector battery against a real DOM: rectangle hit-testing
 * through the instance registry (intersect semantics, innermost-first,
 * measured at query time), the highlight outline (inset, restore-on-clear),
 * and the overlay → panel interaction flow.
 *
 * jsdom reports zero-size rects for everything, so elements get explicit
 * getBoundingClientRect stubs — the hit-test consumes real DOMRect values
 * either way.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';

import { ServiceProvider, connect, componentRoot, view } from '../core/index';
import { InspectorService, InspectorSystem } from './index';
import { ServiceContext } from '../core/services';
import { WheelContext } from '../core/context';
import { useContext } from 'solid-js';

const connectOuter = connect('Outer', () => view({ label: () => 'outer' }, {}));
const connectInner = connect('Inner', () => view({ label: () => 'inner' }, {}));
const connectAside = connect('Aside', () => view({ label: () => 'aside' }, {}));

function fakeRect(element: Element, rect: { left: number; top: number; width: number; height: number }): void {
  (element as HTMLElement).getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({})
    }) as DOMRect;
}

function Outer() {
  connectOuter({});
  return (
    <div use:componentRoot data-testid="outer">
      <Inner />
    </div>
  );
}
function Inner() {
  connectInner({});
  return <span use:componentRoot data-testid="inner" />;
}
function Aside() {
  connectAside({});
  return <div use:componentRoot data-testid="aside" />;
}

function mountApp() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let services!: ServiceContext;
  function Probe() {
    services = useContext(WheelContext)!.services;
    return null;
  }
  const dispose = render(
    () => (
      <ServiceProvider>
        <Probe />
        <Outer />
        <Aside />
        <InspectorSystem />
      </ServiceProvider>
    ),
    host
  );
  // Geometry: outer 0,0→200x100 containing inner 10,10→50x20; aside far right.
  fakeRect(host.querySelector('[data-testid="outer"]')!, { left: 0, top: 0, width: 200, height: 100 });
  fakeRect(host.querySelector('[data-testid="inner"]')!, { left: 10, top: 10, width: 50, height: 20 });
  fakeRect(host.querySelector('[data-testid="aside"]')!, { left: 500, top: 0, width: 100, height: 100 });
  return {
    host,
    inspector: services.get(InspectorService),
    cleanup: () => {
      dispose();
      host.remove();
    }
  };
}

describe('InspectorService.pick', () => {
  it('intersect semantics: touching the rectangle is enough; results are innermost-first with tree depth', () => {
    const app = mountApp();
    app.inspector.pick({ left: 5, top: 5, width: 30, height: 30 });
    expect(app.inspector.mode.get()).toBe('inspecting');
    expect(app.inspector.hits.get().map((hit) => hit.name)).toEqual(['Inner', 'Outer']); // innermost first
    expect(app.inspector.hits.get().map((hit) => hit.depth)).toEqual([1, 0]); // Inner nests under Outer
    app.cleanup();
  });

  it('a rectangle over empty space hits nothing; a far rectangle hits only what it touches', () => {
    const app = mountApp();
    app.inspector.pick({ left: 300, top: 0, width: 50, height: 50 });
    expect(app.inspector.hits.get()).toEqual([]);

    app.inspector.pick({ left: 480, top: 10, width: 50, height: 10 });
    expect(app.inspector.hits.get().map((hit) => hit.name)).toEqual(['Aside']);
    app.cleanup();
  });

  it('unmounted instances can never be hit (elements detach with the component)', () => {
    const app = mountApp();
    app.cleanup();
    app.inspector.pick({ left: 0, top: 0, width: 1000, height: 1000 });
    expect(app.inspector.hits.get()).toEqual([]);
  });
});

describe('InspectorService.highlight', () => {
  it('outlines every element in place and restores the previous style on clear', () => {
    const app = mountApp();
    const inner = app.host.querySelector('[data-testid="inner"]') as HTMLElement;
    inner.style.outline = '1px dotted red'; // pre-existing style must survive

    app.inspector.pick({ left: 0, top: 0, width: 300, height: 300 });
    const innerHit = app.inspector.hits.get().find((hit) => hit.name === 'Inner')!;
    app.inspector.highlight(innerHit.instanceId);
    expect(inner.style.outline).toContain('solid');
    expect(inner.style.outlineOffset).toBe('-2px');

    app.inspector.highlight(null);
    expect(inner.style.outline).toBe('1px dotted red');
    app.cleanup();
  });
});

describe('InspectorSystem interaction', () => {
  it('start → overlay; drag → panel listing hits; Escape → gone', () => {
    const app = mountApp();
    app.inspector.start();
    const overlay = document.querySelector('[data-testid="wheel-inspector-overlay"]') as HTMLElement;
    expect(overlay).not.toBeNull();

    overlay.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }));
    overlay.dispatchEvent(new MouseEvent('pointermove', { clientX: 250, clientY: 120, bubbles: true }));
    overlay.dispatchEvent(new MouseEvent('pointerup', { clientX: 250, clientY: 120, bubbles: true }));

    const panel = document.querySelector('[data-testid="wheel-inspector-panel"]')!;
    expect(panel.textContent).toContain('2 components');
    expect(panel.textContent).toContain('Inner');
    expect(panel.textContent).toContain('Outer');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[data-testid="wheel-inspector-panel"]')).toBeNull();
    expect(app.inspector.mode.get()).toBe('off');
    app.cleanup();
  });

  it("the inspector's own chrome is never a hit (it registers no componentRoot)", () => {
    const app = mountApp();
    app.inspector.pick({ left: 0, top: 0, width: 5000, height: 5000 });
    expect(app.inspector.hits.get().map((hit) => hit.name)).not.toContain('InspectorSystem');
    app.cleanup();
  });
});
