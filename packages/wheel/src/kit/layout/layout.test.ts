import { describe, expect, it } from 'vitest';

import { ServiceContext } from '../../core/services';
import { LayoutService } from './layout-service';
import { parseFrameSize, parseLayoutSnapshot } from './model';
import { memoryLayoutStorage, type LayoutStorage } from './storage';

function nodeOf(service: LayoutService, id: string) {
  const node = service.node(id);
  if (!node) throw new Error(`Unknown frame '${id}'`);
  return node;
}

function createService(storage: LayoutStorage = memoryLayoutStorage()): {
  service: LayoutService;
  context: ServiceContext;
  storage: LayoutStorage;
} {
  class TestLayout extends LayoutService {
    constructor(context: ServiceContext) {
      super(context, { storage, storageKey: 'test' });
    }
  }
  const context = new ServiceContext();
  return { service: context.get(TestLayout), context, storage };
}

interface RegisterOptions {
  readonly kind?: 'row' | 'column' | 'drawer';
  readonly parentId?: string | null;
  readonly parentAxis?: 'row' | 'column' | null;
  readonly size?: `${number}px` | `${number}fr`;
  readonly minSize?: number;
  readonly maxSize?: number | null;
  readonly collapseBelow?: number | null;
  readonly defaultOpen?: boolean;
  readonly scrollable?: 'x' | 'y' | null;
}

function register(
  service: LayoutService,
  id: string,
  options: RegisterOptions = {}
): void {
  service.registerFrame({
    id,
    kind: options.kind ?? 'column',
    parentId: options.parentId ?? null,
    parentAxis: options.parentAxis ?? null,
    size: options.size ?? '1fr',
    minSize: options.minSize ?? 0,
    maxSize: options.maxSize ?? null,
    collapseBelow: options.collapseBelow ?? null,
    defaultOpen: options.defaultOpen ?? true,
    scrollable: options.scrollable ?? null
  });
}

/** A shell: row parent with two measured children ready for pair resizing. */
function registerPair(
  service: LayoutService,
  before: RegisterOptions,
  after: RegisterOptions
): void {
  register(service, 'shell', { kind: 'row' });
  register(service, 'a', { parentId: 'shell', parentAxis: 'row', ...before });
  register(service, 'b', { parentId: 'shell', parentAxis: 'row', ...after });
  service.setChildOrder('shell', ['a', 'b']);
  service.reportMeasurement('shell', { inlineSize: 800, blockSize: 600 });
  service.reportMeasurement('a', { inlineSize: 240, blockSize: 600 });
  service.reportMeasurement('b', { inlineSize: 560, blockSize: 600 });
}

describe('LayoutService v3', () => {
  it('registers frames and exposes live geometry records', () => {
    const { service } = createService();
    register(service, 'nav', { size: '240px', minSize: 180, maxSize: 400 });
    const node = nodeOf(service, 'nav');
    expect(node.open).toBe(true);
    expect(node.visible).toBe(true);
    expect(node.size).toBe('240px');
    expect(node.defaultSize).toBe('240px');
    expect(node.pixels).toBeNull();
    expect(node.dragging).toBe(false);
    expect(() => nodeOf(service, 'missing')).toThrow(/Unknown frame/);
    expect(() => register(service, 'nav')).toThrow(/Duplicate frame id/);
  });

  it('toggles open state and persists only deviations', () => {
    const { service, storage } = createService();
    register(service, 'nav', { size: '240px' });
    service.toggle('nav');
    expect(nodeOf(service, 'nav').open).toBe(false);
    const written = parseLayoutSnapshot(storage.read('test'));
    expect(written?.nodes['nav']).toEqual({ open: false });
    service.toggle('nav');
    expect(storage.read('test')).toBeUndefined();
  });

  it('restores persisted geometry when a frame re-registers', () => {
    const storage = memoryLayoutStorage();
    const first = createService(storage);
    register(first.service, 'nav', { size: '240px' });
    first.service.resize('nav', '320px');
    first.service.close('nav');
    first.context.dispose();

    const second = createService(storage);
    register(second.service, 'nav', { size: '240px' });
    const node = nodeOf(second.service, 'nav');
    expect(node.size).toBe('320px');
    expect(node.open).toBe(false);
    expect(node.defaultSize).toBe('240px');
  });

  it('keeps overrides for unmounted ids so remount restores geometry', () => {
    const { service } = createService();
    register(service, 'editor-1', { size: '1fr' });
    service.resize('editor-1', '3fr');
    service.unregisterFrame('editor-1');
    expect(service.has('editor-1')).toBe(false);
    register(service, 'editor-1', { size: '1fr' });
    expect(nodeOf(service, 'editor-1').size).toBe('3fr');
  });

  it('reset restores defaults and clears storage', () => {
    const { service, storage } = createService();
    register(service, 'nav', { size: '240px' });
    register(service, 'panel', { size: '180px' });
    service.resize('nav', '300px');
    service.close('panel');
    service.reset('nav');
    expect(nodeOf(service, 'nav').size).toBe('240px');
    expect(nodeOf(service, 'panel').open).toBe(false);
    service.reset();
    expect(nodeOf(service, 'panel').open).toBe(true);
    expect(storage.read('test')).toBeUndefined();
  });

  it('rejects invalid sizes at every entry point', () => {
    const { service } = createService();
    expect(() =>
      register(service, 'bad', { size: '50%' as `${number}px` })
    ).toThrow(/invalid size/);
    register(service, 'nav', { size: '240px' });
    expect(() => service.resize('nav', 'auto' as `${number}px`)).toThrow(
      /Invalid frame size/
    );
    expect(parseFrameSize('1.5fr')).toEqual({ unit: 'fr', value: 1.5 });
    expect(parseFrameSize('calc(1px)')).toBeNull();
  });

  it('runs a clamped resize transaction between a pixel and a fraction track', () => {
    const { service, storage } = createService();
    registerPair(
      service,
      { size: '240px', minSize: 180, maxSize: 400 },
      { size: '1fr', minSize: 300 }
    );
    service.beginResize('a', 'b');
    service.updateResize(1000);
    const draft = service.interaction.get();
    expect(draft?.deltaPx).toBe(160);
    expect(service.draftPixels('a')).toBe(400);
    expect(service.draftPixels('b')).toBe(400);
    expect(nodeOf(service, 'a').dragging).toBe(true);
    service.commitResize();
    expect(nodeOf(service, 'a').size).toBe('400px');
    expect(nodeOf(service, 'b').size).toBe('1fr');
    expect(service.interaction.get()).toBeNull();
    const written = parseLayoutSnapshot(storage.read('test'));
    expect(written?.nodes['a']).toEqual({ size: '400px' });
  });

  it('redistributes weight inside a fractional pair without touching others', () => {
    const { service } = createService();
    register(service, 'shell', { kind: 'row' });
    for (const id of ['a', 'b', 'c']) {
      register(service, id, {
        parentId: 'shell',
        parentAxis: 'row',
        size: '1fr'
      });
    }
    service.setChildOrder('shell', ['a', 'b', 'c']);
    service.reportMeasurement('a', { inlineSize: 200, blockSize: 100 });
    service.reportMeasurement('b', { inlineSize: 200, blockSize: 100 });
    service.reportMeasurement('c', { inlineSize: 200, blockSize: 100 });
    service.resizeBy('a', 'b', 100);
    expect(nodeOf(service, 'a').size).toBe('1.5fr');
    expect(nodeOf(service, 'b').size).toBe('0.5fr');
    expect(nodeOf(service, 'c').size).toBe('1fr');
  });

  it('resizes solo inside a scrollable split: growth spills into overflow', () => {
    const { service } = createService();
    register(service, 'shell', { kind: 'row', scrollable: 'x' });
    for (const id of ['a', 'b']) {
      register(service, id, {
        parentId: 'shell',
        parentAxis: 'row',
        size: '1fr',
        minSize: 90
      });
    }
    service.setChildOrder('shell', ['a', 'b']);
    // Both panes squeezed to their minimum — the old pair math would clamp
    // every grow to zero here.
    service.reportMeasurement('a', { inlineSize: 90, blockSize: 100 });
    service.reportMeasurement('b', { inlineSize: 90, blockSize: 100 });

    service.beginResize('a', 'b');
    const draft = service.interaction.get();
    expect(draft?.solo).toBe(true);
    service.updateResize(300);
    expect(service.interaction.get()?.deltaPx).toBe(300);
    expect(service.draftPixels('a')).toBe(390);
    // The neighbor is frozen at its measured size, not traded against.
    expect(service.draftPixels('b')).toBe(90);
    expect(nodeOf(service, 'b').dragging).toBe(false);
    service.commitResize();
    expect(nodeOf(service, 'a').size).toBe('390px');
    // The commit pins siblings where they stood, so nothing reflows.
    expect(nodeOf(service, 'b').size).toBe('90px');

    // Shrinking still clamps to the dragged track's own minimum.
    service.reportMeasurement('a', { inlineSize: 390, blockSize: 100 });
    service.resizeBy('a', 'b', -1000);
    expect(nodeOf(service, 'a').size).toBe('90px');
  });

  it('locks a scrollable split to fit when a snapped draft commits', () => {
    const { service, storage } = createService();
    register(service, 'shell', { kind: 'row', scrollable: 'x' });
    for (const id of ['a', 'b', 'c']) {
      register(service, id, {
        parentId: 'shell',
        parentAxis: 'row',
        size: '1fr',
        minSize: 90
      });
    }
    service.setChildOrder('shell', ['a', 'b', 'c']);
    service.reportMeasurement('a', { inlineSize: 100, blockSize: 100 });
    service.reportMeasurement('b', { inlineSize: 100, blockSize: 100 });
    service.reportMeasurement('c', { inlineSize: 100, blockSize: 100 });

    // Drag pane a, pushing pane c's edge onto the container edge: the
    // component reports the snap target and the commit locks the split.
    service.beginResize('a', 'b');
    service.updateResize(100, 'c');
    expect(service.interaction.get()?.snappedEdgeId).toBe('c');
    service.commitResize();

    // All visible children became proportional weights (200:100:100 → 1.5:0.75:0.75).
    expect(nodeOf(service, 'a').size).toBe('1.5fr');
    expect(nodeOf(service, 'b').size).toBe('0.75fr');
    expect(nodeOf(service, 'c').size).toBe('0.75fr');
    expect(nodeOf(service, 'shell').fitLocked).toBe(true);
    const written = parseLayoutSnapshot(storage.read('test'));
    expect(written?.nodes['shell']).toEqual({ locked: true });

    // Locked: a middle handle trades space (pair), keeping the fit.
    service.beginResize('a', 'b');
    expect(service.interaction.get()?.solo).toBe(false);
    service.cancelResize();

    // Locked: the trailing handle still resizes solo — that is the unlock.
    service.reportMeasurement('c', { inlineSize: 100, blockSize: 100 });
    service.beginResize('c', null);
    expect(service.interaction.get()?.solo).toBe(true);
    service.updateResize(60);
    service.commitResize();
    expect(nodeOf(service, 'shell').fitLocked).toBe(false);
    expect(nodeOf(service, 'c').size).toBe('160px');
  });

  it('setFitLocked locks and unlocks a split directly', () => {
    const { service, storage } = createService();
    register(service, 'shell', { kind: 'row', scrollable: 'x' });
    service.setFitLocked('shell', true);
    expect(nodeOf(service, 'shell').fitLocked).toBe(true);
    expect(parseLayoutSnapshot(storage.read('test'))?.nodes['shell']).toEqual({
      locked: true
    });
    service.setFitLocked('shell', false);
    expect(nodeOf(service, 'shell').fitLocked).toBe(false);
    expect(storage.read('test')).toBeUndefined();
    expect(() => service.setFitLocked('missing', true)).toThrow(/Unknown frame/);
  });

  it('locks on a zero-delta snapped commit and restores the lock from storage', () => {
    const storage = memoryLayoutStorage();
    const first = createService(storage);
    register(first.service, 'shell', { kind: 'row', scrollable: 'x' });
    register(first.service, 'only', {
      parentId: 'shell',
      parentAxis: 'row',
      size: '1fr'
    });
    first.service.setChildOrder('shell', ['only']);
    first.service.reportMeasurement('only', { inlineSize: 500, blockSize: 100 });
    first.service.beginResize('only', null);
    // Already at fit: no movement, but the snap still means "lock here".
    first.service.updateResize(0, 'only');
    first.service.commitResize();
    expect(first.service.node('shell')?.fitLocked).toBe(true);
    first.context.dispose();

    const second = createService(storage);
    register(second.service, 'shell', { kind: 'row', scrollable: 'x' });
    expect(second.service.node('shell')?.fitLocked).toBe(true);
    second.service.reset();
    expect(second.service.node('shell')?.fitLocked).toBe(false);
  });

  it('keeps an attached row attached: the tail absorbs non-trailing drags', () => {
    const { service } = createService();
    register(service, 'shell', { kind: 'row', scrollable: 'x' });
    for (const id of ['a', 'b', 'c']) {
      register(service, id, {
        parentId: 'shell',
        parentAxis: 'row',
        size: '1fr',
        minSize: 90
      });
    }
    service.setChildOrder('shell', ['a', 'b', 'c']);
    service.reportMeasurement('shell', { inlineSize: 600, blockSize: 400 });
    service.reportMeasurement('a', { inlineSize: 200, blockSize: 400 });
    service.reportMeasurement('b', { inlineSize: 200, blockSize: 400 });
    service.reportMeasurement('c', { inlineSize: 200, blockSize: 400 });

    service.beginResize('a', 'b');
    expect(service.interaction.get()?.tailAbsorb).toEqual({
      lastId: 'c',
      basePx: 200,
      attachPx: 400
    });
    // Shrinking the dragged pane grows the tail — the row never detaches.
    service.updateResize(-60);
    expect(service.draftPixels('a')).toBe(140);
    expect(service.draftPixels('b')).toBe(200);
    expect(service.draftPixels('c')).toBe(260);
    // Growing overflows immediately; the tail never shrinks below its base.
    service.updateResize(150);
    expect(service.draftPixels('a')).toBe(350);
    expect(service.draftPixels('c')).toBe(200);
    service.cancelResize();

    // A drag that starts OVERFLOWING burns the overflow first, then the tail
    // grows — crossing the fit mid-drag never opens a gap.
    service.reportMeasurement('shell', { inlineSize: 500, blockSize: 400 });
    service.beginResize('a', 'b');
    expect(service.interaction.get()?.tailAbsorb).toEqual({
      lastId: 'c',
      basePx: 200,
      attachPx: 300
    });
    // Clamped to a's own minimum (90): 110px of shrink — the first 100 burn
    // the overflow, the last 10 grow the tail. No gap at any point.
    service.updateResize(-150);
    expect(service.draftPixels('a')).toBe(90);
    expect(service.draftPixels('c')).toBe(210);
    service.cancelResize();

    // The last pane's own trailing drag never absorbs — it detaches on purpose.
    service.reportMeasurement('shell', { inlineSize: 600, blockSize: 400 });
    service.beginResize('c', null);
    expect(service.interaction.get()?.tailAbsorb).toBeNull();
  });

  it('gives the last child of a scrollable split a neighborless resize', () => {
    const { service } = createService();
    register(service, 'shell', { kind: 'row', scrollable: 'x' });
    register(service, 'only', {
      parentId: 'shell',
      parentAxis: 'row',
      size: '1fr',
      minSize: 90
    });
    service.setChildOrder('shell', ['only']);
    service.reportMeasurement('only', { inlineSize: 600, blockSize: 100 });

    expect(service.nextVisibleSibling('only')).toBeNull();
    service.beginResize('only', null);
    expect(service.interaction.get()?.solo).toBe(true);
    service.updateResize(-200);
    service.commitResize();
    expect(nodeOf(service, 'only').size).toBe('400px');

    // Outside a scrollable split a neighborless resize stays impossible.
    const fit = createService();
    register(fit.service, 'shell', { kind: 'row' });
    register(fit.service, 'a', { parentId: 'shell', parentAxis: 'row' });
    fit.service.reportMeasurement('a', { inlineSize: 300, blockSize: 100 });
    fit.service.beginResize('a', null);
    expect(fit.service.interaction.get()).toBeNull();
  });

  it('cancels a resize draft without committing anything', () => {
    const { service, storage } = createService();
    registerPair(service, { size: '240px' }, { size: '1fr' });
    service.beginResize('a', 'b');
    service.updateResize(50);
    service.cancelResize();
    expect(nodeOf(service, 'a').size).toBe('240px');
    expect(service.interaction.get()).toBeNull();
    expect(storage.read('test')).toBeUndefined();
  });

  it('commits a zero-delta resize as a no-op', () => {
    const { service, storage } = createService();
    registerPair(service, { size: '240px' }, { size: '1fr' });
    service.beginResize('a', 'b');
    service.commitResize();
    expect(nodeOf(service, 'a').size).toBe('240px');
    expect(storage.read('test')).toBeUndefined();
  });

  it('resetPair restores both adjacent tracks to their JSX defaults', () => {
    const { service } = createService();
    registerPair(service, { size: '240px' }, { size: '1fr' });
    service.resizeBy('a', 'b', 60);
    expect(nodeOf(service, 'a').size).toBe('300px');
    service.resetPair('a', 'b');
    expect(nodeOf(service, 'a').size).toBe('240px');
    expect(nodeOf(service, 'b').size).toBe('1fr');
  });

  it('collapses below the container threshold without changing the request', () => {
    const { service } = createService();
    register(service, 'shell', { kind: 'row' });
    register(service, 'nav', {
      parentId: 'shell',
      parentAxis: 'row',
      size: '240px',
      collapseBelow: 700
    });
    service.reportMeasurement('shell', { inlineSize: 900, blockSize: 600 });
    expect(service.visible('nav')).toBe(true);
    service.reportMeasurement('shell', { inlineSize: 640, blockSize: 600 });
    expect(service.visible('nav')).toBe(false);
    expect(nodeOf(service, 'nav').open).toBe(true);
    service.reportMeasurement('shell', { inlineSize: 900, blockSize: 600 });
    expect(service.visible('nav')).toBe(true);
  });

  it('finds the next visible sibling across hidden neighbors', () => {
    const { service } = createService();
    register(service, 'shell', { kind: 'row' });
    for (const id of ['a', 'b', 'c']) {
      register(service, id, { parentId: 'shell', parentAxis: 'row' });
    }
    service.setChildOrder('shell', ['a', 'b', 'c']);
    expect(service.nextVisibleSibling('a')).toBe('b');
    service.close('b');
    expect(service.nextVisibleSibling('a')).toBe('c');
    service.close('c');
    expect(service.nextVisibleSibling('a')).toBeNull();
    expect(service.nextVisibleSibling('c')).toBeNull();
  });

  it('falls back to defaults with a diagnostic when the snapshot is invalid', () => {
    const poisoned: LayoutStorage = {
      read: () => ({ formatVersion: 99, nodes: { nav: { size: 'huge' } } }),
      write: () => undefined,
      remove: () => undefined
    };
    const { service } = createService(poisoned);
    register(service, 'nav', { size: '240px' });
    expect(nodeOf(service, 'nav').size).toBe('240px');
    expect(service.diagnostics()).toEqual([
      expect.objectContaining({ kind: 'storage' })
    ]);
  });

  it('reports diagnostics instead of throwing when storage write fails', () => {
    const failing: LayoutStorage = {
      read: () => undefined,
      write: () => {
        throw new Error('quota exceeded');
      },
      remove: () => undefined
    };
    const { service } = createService(failing);
    register(service, 'nav', { size: '240px' });
    service.close('nav');
    expect(nodeOf(service, 'nav').open).toBe(false);
    expect(service.diagnostics()).toEqual([
      expect.objectContaining({ kind: 'storage', message: expect.stringContaining('quota') })
    ]);
  });
});
