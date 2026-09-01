/**
 * The debug invalidation channels, and who they reach.
 *
 * Two rules, and the second one is the one that broke.
 *
 * 1. SHAPE and VALUES ride separate wires. `trackInstances` reports mounts,
 *    unmounts and renames; `trackDebug` reports service field writes. A
 *    surface that draws the component tree subscribes to shape, so hovering
 *    one of its own rows — which writes a field — cannot rebuild it.
 *
 * 2. Both wires follow the REGISTRY. A child context shares its parent's
 *    registry, so it must share the signals that report changes to it.
 *    Giving each context its own signals and wiring only the root produced a
 *    channel that never fired: a demo's debug panel lives in a child context,
 *    so its component tree froze at first paint — the app root was there and
 *    the rows that mounted later never appeared.
 *
 *    That looked fine for a long time only because the tree ALSO tracked the
 *    data revision, which is genuinely per-context. The tree redrew on sync
 *    traffic and seemed live; a mount on its own did nothing.
 */
import { describe, expect, it } from 'vitest';
import { createRoot, createEffect } from 'solid-js';

import { ServiceContext } from './services';

/** Count how many times a tracked read fires, starting from its first run. */
function watch(read: () => number): { runs: () => number; dispose: () => void } {
  let runs = 0;
  let dispose = (): void => {};
  createRoot((disposer) => {
    dispose = disposer;
    createEffect(() => {
      read();
      runs += 1;
    });
  });
  return { runs: () => runs, dispose };
}

describe('debug channels', () => {
  it('reports a mount on the shape channel, not the value channel', () => {
    const context = new ServiceContext();
    const shape = watch(() => context.trackInstances());
    const values = watch(() => context.trackDebug());
    const before = { shape: shape.runs(), values: values.runs() };

    const { unregister } = context.registry.registerInstance('TodoRow', {}, { kind: 'view' });

    expect(shape.runs()).toBeGreaterThan(before.shape);
    // A field write is what the value channel is for; a mount is not.
    expect(values.runs()).toBe(before.values);

    unregister();
    shape.dispose();
    values.dispose();
    context.dispose();
  });

  it('reaches a CHILD context, which shares the same registry', () => {
    const root = new ServiceContext();
    const child = new ServiceContext({ parent: root });
    // Same registry — so the same changes, and therefore the same channel.
    expect(child.registry).toBe(root.registry);

    const shape = watch(() => child.trackInstances());
    const before = shape.runs();

    root.registry.registerInstance('TodoRow', {}, { kind: 'view' });

    // The bug: the child had its own signal and nothing wired it, so a panel
    // mounted in a child context never saw a row mount.
    expect(shape.runs()).toBeGreaterThan(before);

    shape.dispose();
    child.dispose();
    root.dispose();
  });

  it('reaches a grandchild too, however deep the providers nest', () => {
    const root = new ServiceContext();
    const child = new ServiceContext({ parent: root });
    const grandchild = new ServiceContext({ parent: child });

    const shape = watch(() => grandchild.trackInstances());
    const before = shape.runs();

    root.registry.registerInstance('TodoRow', {}, { kind: 'view' });

    expect(shape.runs()).toBeGreaterThan(before);

    shape.dispose();
    grandchild.dispose();
    child.dispose();
    root.dispose();
  });
});
