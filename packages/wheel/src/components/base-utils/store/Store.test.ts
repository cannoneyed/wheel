// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, createMemo } from 'solid-js';
import { Store } from './Store';
import { SolidStore } from './SolidStore';
import { createSelector } from './createSelector';

describe('Store', () => {
  it('reads and writes state synchronously', () => {
    const store = new Store({ count: 0, label: 'a' });
    expect(store.state.count).toBe(0);
    store.set('count', 1);
    expect(store.state.count).toBe(1);
    store.update({ count: 2, label: 'b' });
    expect(store.state).toMatchObject({ count: 2, label: 'b' });
  });

  it('skips writes when values are identical', () => {
    const store = new Store({ count: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set('count', 0);
    store.update({ count: 0 });
    expect(listener).not.toHaveBeenCalled();
    store.set('count', 1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is reactive inside tracked scopes', () => {
    createRoot((dispose) => {
      const store = new Store({ count: 0, other: 'x' });
      let evaluations = 0;
      const double = createMemo(() => {
        evaluations += 1;
        return store.state.count * 2;
      });
      expect(double()).toBe(0);
      store.set('count', 2);
      expect(double()).toBe(4);
      store.set('other', 'y');
      expect(evaluations).toBe(2);
      dispose();
    });
  });
});

describe('SolidStore', () => {
  it('exposes selectors as accessors and keeps context non-reactive', () => {
    createRoot((dispose) => {
      const selectors = {
        open: createSelector((state: { open: boolean }) => state.open),
      };
      const store = new SolidStore({ open: false }, { events: 'ctx' }, selectors);
      const open = store.useState('open');
      expect(open()).toBe(false);
      store.set('open', true);
      expect(open()).toBe(true);
      expect(store.context.events).toBe('ctx');
      dispose();
    });
  });
});
