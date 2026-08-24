// @vitest-environment jsdom
import { createRoot, createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullStore } from '../NullStore';
import { BasePopupHandle } from './popupHandle';
import { PopupTriggerMap } from './popupTriggerMap';
import { usePopupHandleStore } from './usePopupHandleStore';

interface TestState {
  open: boolean;
}

type TestContext = { triggerElements: PopupTriggerMap };

class TestStore extends NullStore<TestState, TestContext> {
  setOpen = vi.fn();

  constructor() {
    super({ open: false }, { triggerElements: new PopupTriggerMap() });
  }
}

class TestHandle extends BasePopupHandle<TestStore, TestStore> {
  constructor(throwOnMissingTrigger = true) {
    super(new TestStore(), 'Test', throwOnMissingTrigger);
  }

  open(triggerId?: string | null) {
    this.openByTrigger(triggerId);
  }

  close() {
    this.closePopup();
  }
}

describe('BasePopupHandle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the fallback store while detached and the root store once attached', () => {
    const handle = new TestHandle();
    const fallback = handle.store;
    const rootStore = new TestStore();

    const detach = handle.attachStore(rootStore);
    expect(handle.store).toBe(rootStore);

    detach();
    expect(handle.store).toBe(fallback);
  });

  it('notifies subscribers on attach and detach', () => {
    const handle = new TestHandle();
    const listener = vi.fn();
    const unsubscribe = handle.subscribeStore(listener);

    const detach = handle.attachStore(new TestStore());
    expect(listener).toHaveBeenCalledTimes(1);

    detach();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    handle.attachStore(new TestStore());
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('restores the previous root when an overlapping newer root detaches first', () => {
    const handle = new TestHandle();
    const first = new TestStore();
    const second = new TestStore();

    handle.attachStore(first);
    const detachSecond = handle.attachStore(second);
    expect(handle.store).toBe(second);

    detachSecond();
    expect(handle.store).toBe(first);
  });

  it('opens via the attached store, resolving the trigger element by id', () => {
    const handle = new TestHandle();
    const rootStore = new TestStore();
    const trigger = document.createElement('button');
    rootStore.context.triggerElements.add('t1', trigger);

    handle.attachStore(rootStore);
    handle.open('t1');

    expect(rootStore.setOpen).toHaveBeenCalledTimes(1);
    const [open, details] = rootStore.setOpen.mock.calls[0];
    expect(open).toBe(true);
    expect(details.reason).toBe('imperative-action');
    expect(details.trigger).toBe(trigger);
  });

  it('resolves triggers still registered in the fallback store at attach time', () => {
    const handle = new TestHandle();
    const trigger = document.createElement('button');
    // Simulate a detached trigger registered before any root attached.
    (handle.store as TestStore).context.triggerElements.add('t1', trigger);

    const rootStore = new TestStore();
    handle.attachStore(rootStore);
    handle.open('t1');

    expect(rootStore.setOpen).toHaveBeenCalledTimes(1);
    expect(rootStore.setOpen.mock.calls[0][1].trigger).toBe(trigger);
  });

  it('throws for a missing trigger id when throwOnMissingTrigger is set', () => {
    const handle = new TestHandle(true);
    handle.attachStore(new TestStore());
    expect(() => handle.open('missing')).toThrow(/no matching trigger/);
  });

  it('opens unassociated with a warning for a missing trigger id when not throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handle = new TestHandle(false);
    const rootStore = new TestStore();
    handle.attachStore(rootStore);

    handle.open('missing');

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No trigger found'));
    expect(rootStore.setOpen).toHaveBeenCalledTimes(1);
    expect(rootStore.setOpen.mock.calls[0][1].trigger).toBeUndefined();
  });

  it('warns and no-ops when opened or closed while no root is attached', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handle = new TestHandle();

    handle.open('t1');
    handle.close();

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('closes via the attached store', () => {
    const handle = new TestHandle();
    const rootStore = new TestStore();
    handle.attachStore(rootStore);

    handle.close();

    expect(rootStore.setOpen).toHaveBeenCalledTimes(1);
    expect(rootStore.setOpen.mock.calls[0][0]).toBe(false);
  });
});

describe('usePopupHandleStore', () => {
  it('returns undefined without a handle and follows the store pointer with one', () => {
    createRoot((dispose) => {
      const handle = new TestHandle();
      const fallback = handle.store;
      const [handleProp, setHandleProp] = createSignal<TestHandle | undefined>(undefined);

      const store = usePopupHandleStore<TestStore>(handleProp);
      expect(store()).toBeUndefined();

      setHandleProp(handle);
      expect(store()).toBe(fallback);

      const rootStore = new TestStore();
      const detach = handle.attachStore(rootStore);
      expect(store()).toBe(rootStore);

      detach();
      expect(store()).toBe(fallback);

      setHandleProp(undefined);
      expect(store()).toBeUndefined();

      dispose();
    });
  });

  it('unsubscribes from the previous handle when the handle prop changes', () => {
    createRoot((dispose) => {
      const first = new TestHandle();
      const second = new TestHandle();
      const [handleProp, setHandleProp] = createSignal<TestHandle | undefined>(first);

      const store = usePopupHandleStore<TestStore>(handleProp);
      expect(store()).toBe(first.store);

      setHandleProp(second);
      expect(store()).toBe(second.store);

      // An attach on the old handle must no longer update the accessor.
      first.attachStore(new TestStore());
      expect(store()).toBe(second.store);

      dispose();
    });
  });
});
