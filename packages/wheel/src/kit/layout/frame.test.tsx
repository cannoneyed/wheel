// @vitest-environment jsdom
/**
 * Frame components against a real LayoutService: registration by id, DOM
 * child order, live geometry styles, collapse, the accessible resize handle,
 * keyboard resizing, drawer overlay state, and unregister-on-unmount.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createSignal, Show, type JSX } from 'solid-js';
import { render } from 'solid-js/web';

import { ServiceProvider, connect } from '../../core/index';
import { Frame } from './frame-namespace';
import { LayoutService } from './layout-service';

let scopeCounter = 0;

function mountShell(ui: () => JSX.Element): {
  layout: LayoutService;
  cleanup: () => void;
} {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let layout!: LayoutService;
  const connectGrab = connect('LayoutProbe', (c) => {
    layout = c.service(LayoutService);
    return {};
  });
  function Grab(): null {
    connectGrab({});
    return null;
  }
  scopeCounter += 1;
  const dispose = render(
    () => (
      <ServiceProvider scopeId={`frame-test-${scopeCounter}`}>
        <Grab />
        {ui()}
      </ServiceProvider>
    ),
    host
  );
  return {
    layout,
    cleanup: () => {
      dispose();
      host.remove();
    }
  };
}

function Shell(): JSX.Element {
  return (
    <Frame.Row id="shell">
      <Frame.Column id="nav" size="240px" minSize="180px" maxSize="400px">
        <nav>files</nav>
      </Frame.Column>
      <Frame.Column id="main" size="1fr" minSize="320px">
        <main>editor</main>
      </Frame.Column>
    </Frame.Row>
  );
}

const frameEl = (id: string): HTMLElement =>
  document.querySelector(`[data-wheel-frame="${id}"]`) as HTMLElement;
const handleEl = (id: string): HTMLElement =>
  document.querySelector(`[data-wheel-frame-handle="${id}"]`) as HTMLElement;

beforeEach(() => {
  localStorage.clear();
});

describe('Frame components', () => {
  it('registers mounted frames with parent and DOM order', () => {
    const { layout, cleanup } = mountShell(() => <Shell />);
    try {
      expect(layout.has('shell')).toBe(true);
      expect(layout.node('nav')!.parentId).toBe('shell');
      expect(layout.node('nav')!.parentAxis).toBe('row');
      expect(layout.childOrder('shell')).toEqual(['nav', 'main']);
      expect(layout.node('nav')!.size).toBe('240px');
      expect(frameEl('nav').style.flex).toBe('0 0 240px');
      // fr grow factors are scaled ×1000 so their sum can never drop below
      // 1, where flexbox would under-fill the row and leave a gap.
      expect(frameEl('main').style.flex).toBe('1000 1 0%');
    } finally {
      cleanup();
    }
  });

  it('renders an accessible resize handle between visible siblings only', () => {
    const { layout, cleanup } = mountShell(() => <Shell />);
    try {
      const handle = handleEl('nav');
      expect(handle.getAttribute('role')).toBe('separator');
      expect(handle.getAttribute('aria-orientation')).toBe('vertical');
      expect(handle.tabIndex).toBe(0);
      // The last sibling has no trailing handle.
      expect(handleEl('main').style.display).toBe('none');
      expect(handleEl('main').tabIndex).toBe(-1);
      layout.close('main');
      expect(handleEl('nav').style.display).toBe('none');
    } finally {
      cleanup();
    }
  });

  it('collapses a closed frame without unmounting its content', () => {
    const { layout, cleanup } = mountShell(() => <Shell />);
    try {
      layout.close('nav');
      const nav = frameEl('nav');
      expect(nav.dataset['frameVisible']).toBe('false');
      expect(nav.style.visibility).toBe('hidden');
      expect(nav.getAttribute('aria-hidden')).toBe('true');
      expect(nav.querySelector('nav')?.textContent).toBe('files');
      layout.open('nav');
      expect(frameEl('nav').dataset['frameVisible']).toBe('true');
      expect(frameEl('nav').style.flex).toBe('0 0 240px');
    } finally {
      cleanup();
    }
  });

  it('resizes with the keyboard through the same clamped service math', () => {
    const { layout, cleanup } = mountShell(() => <Shell />);
    try {
      layout.reportMeasurement('shell', { inlineSize: 900, blockSize: 600 });
      layout.reportMeasurement('nav', { inlineSize: 240, blockSize: 600 });
      layout.reportMeasurement('main', { inlineSize: 660, blockSize: 600 });
      const handle = handleEl('nav');
      const press = (key: string, shiftKey = false): void => {
        handle.dispatchEvent(
          new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })
        );
      };
      press('ArrowRight');
      expect(layout.node('nav')!.size).toBe('250px');
      layout.reportMeasurement('nav', { inlineSize: 250, blockSize: 600 });
      layout.reportMeasurement('main', { inlineSize: 650, blockSize: 600 });
      press('ArrowLeft', true);
      expect(layout.node('nav')!.size).toBe('200px');
      layout.reportMeasurement('nav', { inlineSize: 200, blockSize: 600 });
      press('End');
      // Clamped by nav's own maxSize.
      expect(layout.node('nav')!.size).toBe('400px');
    } finally {
      cleanup();
    }
  });

  it('unregisters on unmount and restores remembered geometry on remount', () => {
    const [showNav, setShowNav] = createSignal(true);
    const { layout, cleanup } = mountShell(() => (
      <Frame.Row id="shell">
        <Show when={showNav()}>
          <Frame.Column id="nav" size="240px">
            <nav>files</nav>
          </Frame.Column>
        </Show>
        <Frame.Column id="main" size="1fr">
          <main>editor</main>
        </Frame.Column>
      </Frame.Row>
    ));
    try {
      layout.resize('nav', '320px');
      setShowNav(false);
      expect(layout.has('nav')).toBe(false);
      expect(layout.childOrder('shell')).toEqual(['main']);
      setShowNav(true);
      expect(layout.node('nav')!.size).toBe('320px');
      expect(layout.childOrder('shell')).toEqual(['nav', 'main']);
    } finally {
      cleanup();
    }
  });

  it('drawers start closed, overlay above content, and toggle from the service', () => {
    const { layout, cleanup } = mountShell(() => (
      <Frame.Row id="shell">
        <Frame.Column id="main" size="1fr">
          <main>editor</main>
        </Frame.Column>
        <Frame.Drawer id="inspector" side="right" size="320px" label="Inspector">
          <p>details</p>
        </Frame.Drawer>
      </Frame.Row>
    ));
    try {
      const drawer = frameEl('inspector');
      expect(layout.node('inspector')!.open).toBe(false);
      expect(drawer.dataset['frameOpen']).toBe('false');
      expect(drawer.style.transform).toBe('translateX(100%)');
      expect(drawer.style.visibility).toBe('hidden');
      // Drawers never join the parent split.
      expect(layout.childOrder('shell')).toEqual(['main']);
      layout.toggle('inspector');
      expect(frameEl('inspector').dataset['frameOpen']).toBe('true');
      expect(frameEl('inspector').style.transform).toBe('none');
      expect(frameEl('inspector').getAttribute('aria-label')).toBe('Inspector');
    } finally {
      cleanup();
    }
  });
});
