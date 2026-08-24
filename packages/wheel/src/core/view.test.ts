/**
 * view() beyond shape-building: it records each read that carries debug
 * provenance as a dependency of the component currently connecting (so the
 * debug panel's component → value edges populate), and it fails loudly on the
 * called-accessor mistake — passing `svc.x()` (an already-read value) instead
 * of `svc.x` (the accessor) or `() => svc.x(id)` (a deferred thunk).
 */
import { afterEach, describe, expect, it } from 'vitest';

import { view } from './view';
import { DebugRegistry, setActiveRegistry, type DebugMeta } from './debug-registry';

function meta(id: string, name: string, kind: DebugMeta['kind']): DebugMeta {
  return { id, name, kind };
}

/** An atom-like read (has zero-arg `.get()`) carrying provenance. */
function fakeAtom(id: string): { get: () => number; __debugMeta: DebugMeta } {
  return { get: () => 1, __debugMeta: meta(id, 'filter', 'atom') };
}

/** A computed-accessor-like read (callable) carrying provenance. */
function fakeAccessor(id: string): (() => number) & { __debugMeta: DebugMeta } {
  return Object.assign(() => 2, { __debugMeta: meta(id, 'remaining', 'computed') });
}

afterEach(() => setActiveRegistry(null));

describe('view() records reads', () => {
  it('adds every provenance-carrying read as the connecting component dependency', () => {
    const registry = new DebugRegistry();
    registry.currentComponent = 'Widget';
    setActiveRegistry(registry);

    view(
      {
        filter: fakeAtom('atom_1'), // atom, direct
        remaining: fakeAccessor('computed_1'), // computed accessor, direct
        thunk: () => 3 // plain thunk — no provenance, not recorded
      },
      { save: () => {} }
    );

    setActiveRegistry(null);
    const component = registry.snapshot().components.find((c) => c.name === 'Widget');
    expect(component).toBeDefined();
    expect([...component!.dependencies].sort()).toEqual(['atom_1', 'computed_1']);
  });

  it('records nothing outside a connect declaration (no active registry)', () => {
    // No setActiveRegistry — a plain view() call in a non-connect context.
    expect(() => view({ filter: fakeAtom('atom_9') })).not.toThrow();
  });
});

describe('view() catches the called-accessor mistake', () => {
  it('throws when a read is a primitive (accessor was called)', () => {
    expect(() => view({ count: 5 as unknown as () => number })).toThrow(/not a read/);
  });

  it('throws when a read is an array (a query result, already read)', () => {
    expect(() => view({ rows: [1, 2, 3] as unknown as object })).toThrow(/not a read/);
  });

  it('throws when a read is null', () => {
    expect(() => view({ x: null as unknown as object })).toThrow(/not a read/);
  });

  it('names the offending field in the message', () => {
    expect(() => view({ badField: 7 as unknown as () => number })).toThrow(/"badField"/);
  });

  it('passes a live view object (getters, no .get) through untouched', () => {
    const liveView = {
      get rows(): readonly number[] {
        return [1];
      }
    };
    const shape = view({ list: liveView });
    expect((shape.list as typeof liveView).rows).toEqual([1]);
  });
});

describe('view() reads that take an argument', () => {
  it('puts the SELECTOR on the shape, not its no-argument result', () => {
    const on = new Set(['a']);
    const shape = view({ isOn: (id: string) => on.has(id) });
    // The bug this pins: a getter here called the selector with no argument
    // and froze the answer, so `shape.isOn(id)` threw "is not a function".
    expect(typeof shape.isOn).toBe('function');
    expect(shape.isOn('a')).toBe(true);
    expect(shape.isOn('b')).toBe(false);
  });

  it('defers the read — the selector sees state as it stands at call time', () => {
    const on = new Set<string>();
    const shape = view({ isOn: (id: string) => on.has(id) });
    on.add('late');
    expect(shape.isOn('late')).toBe(true);
  });

  it('leaves a zero-argument accessor a value read', () => {
    const shape = view({ count: () => 7 });
    expect(shape.count).toBe(7);
  });
});
