// @vitest-environment jsdom
/**
 * SnapshotService: marquee → staged capture with the component context under
 * the rect; copy/save/discard; capture failures land in the log, not thrown.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render } from 'solid-js/web';
import { useContext } from 'solid-js';

import { ServiceProvider, connect, componentRoot, view } from '../core';
import { WheelContext, type WheelContextValue } from '../core/context';

import { SnapshotService, SnapshotSystem, setSnapshotCapture } from './snapshot';

const connectChip = connect('Chip', () => view({ label: () => 'hi' }, {}));

function Chip() {
  const state = connectChip({});
  return <b use:componentRoot>{state.label}</b>;
}

let teardown: (() => void) | null = null;

function mountApp() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let context!: WheelContextValue;
  const Probe = () => {
    context = useContext(WheelContext)!;
    return null;
  };
  const dispose = render(
    () => (
      <ServiceProvider>
        <Probe />
        <Chip />
      </ServiceProvider>
    ),
    host
  );
  // jsdom rects are all 0×0 — make the chip's element "cover" a region.
  const chip = host.querySelector('b')!;
  chip.getBoundingClientRect = () => new DOMRect(10, 10, 100, 40);
  teardown = () => {
    dispose();
    host.remove();
    setSnapshotCapture(null);
    teardown = null;
  };
  return { context, service: context.services.get(SnapshotService) };
}

const flush = () => new Promise((resolveTick) => queueMicrotask(() => queueMicrotask(() => resolveTick(undefined))));

describe('SnapshotService', () => {
  afterEach(() => teardown?.());

  it('capture stages the frame plus the components under the rect', async () => {
    const { service } = mountApp();
    setSnapshotCapture(async () => 'data:image/png;base64,AAAA');
    service.capture({ left: 0, top: 0, width: 200, height: 200 });
    await flush();
    expect(service.mode.get()).toBe('staged');
    const staged = service.staged.get()!;
    expect(staged.dataUrl).toBe('data:image/png;base64,AAAA');
    expect(staged.context.components).toMatchObject([
      { instanceId: 'Chip', kind: 'connected', state: { label: 'hi' } }
    ]);
  });

  it('a rect that misses every component stages an empty context', async () => {
    const { service } = mountApp();
    setSnapshotCapture(async () => 'data:x');
    service.capture({ left: 500, top: 500, width: 50, height: 50 });
    await flush();
    expect(service.staged.get()!.context.components).toEqual([]);
  });

  it('capture failure logs and returns to off — never throws', async () => {
    const { service } = mountApp();
    setSnapshotCapture(async () => {
      throw new Error('permission denied');
    });
    service.capture({ left: 0, top: 0, width: 10, height: 10 });
    await flush();
    expect(service.mode.get()).toBe('off');
    expect(service.staged.get()).toBeNull();
  });

  it('save POSTs png + context and records the returned directory', async () => {
    const { service } = mountApp();
    setSnapshotCapture(async () => 'data:image/png;base64,AAAA');
    service.capture({ left: 0, top: 0, width: 200, height: 200 });
    await flush();
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, dir: '/repo/.wheel/snapshots/1-Chip' })));
    vi.stubGlobal('fetch', fetchSpy);
    service.save();
    // The save chain crosses several microtask turns (fetch → json → set).
    await vi.waitFor(() => expect(service.savedTo.get()).toBe('/repo/.wheel/snapshots/1-Chip'));
    expect(fetchSpy).toHaveBeenCalledWith('/__wheel/snapshot', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(body).toMatchObject({ name: 'Chip', png: 'data:image/png;base64,AAAA' });
    vi.unstubAllGlobals();
  });

  it('the marquee overlay drags a rect into capture()', async () => {
    const { context, service } = mountApp();
    setSnapshotCapture(async () => 'data:x');
    const overlayHost = document.createElement('div');
    document.body.appendChild(overlayHost);
    const dispose = render(
      () => (
        <WheelContext.Provider value={context}>
          <SnapshotSystem service={service} />
        </WheelContext.Provider>
      ),
      overlayHost
    );
    service.start();
    const overlay = document.querySelector('[data-testid="wheel-snapshot-overlay"]') as HTMLElement;
    expect(overlay).not.toBeNull();
    overlay.dispatchEvent(new MouseEvent('pointerdown', { clientX: 5, clientY: 5, bubbles: true }));
    overlay.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 120, bubbles: true }));
    overlay.dispatchEvent(new MouseEvent('pointerup', { clientX: 150, clientY: 120, bubbles: true }));
    await flush();
    expect(service.staged.get()!.rect).toEqual({ left: 5, top: 5, width: 145, height: 115 });
    dispose();
    overlayHost.remove();
  });
});
