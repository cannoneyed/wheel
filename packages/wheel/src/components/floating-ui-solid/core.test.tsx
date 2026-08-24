// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, createSignal, type Accessor } from 'solid-js';
import { render } from '@solidjs/testing-library';
import { createChangeEventDetails } from '../internals/createBaseUIEventDetails';
import { REASONS } from '../internals/reasons';
import { PopupTriggerMap } from '../utils/popups/popupTriggerMap';
import { createEventEmitter } from './utils/createEventEmitter';
import { FloatingRootStore } from './components/FloatingRootStore';
import { FloatingTreeStore } from './components/FloatingTreeStore';
import { useFloatingNodeId } from './components/FloatingTree';
import { useFloatingRootContext } from './hooks/useFloatingRootContext';
import { useFloating } from './hooks/useFloating';
import { usePosition } from './hooks/usePosition';
import type { UseFloatingReturn } from './types';

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createEventEmitter', () => {
  it('emits to registered listeners and stops after off()', () => {
    const emitter = createEventEmitter();
    const listener = vi.fn();
    emitter.on('openchange', listener);

    emitter.emit('openchange', { open: true });
    expect(listener).toHaveBeenCalledWith({ open: true });

    emitter.off('openchange', listener);
    emitter.emit('openchange', { open: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('PopupTriggerMap', () => {
  it('adds, retrieves, and deletes trigger elements by id', () => {
    const map = new PopupTriggerMap();
    const button = document.createElement('button');

    map.add('trigger', button);
    expect(map.getById('trigger')).toBe(button);
    expect(map.hasElement(button)).toBe(true);
    expect(map.size).toBe(1);

    map.delete('trigger');
    expect(map.getById('trigger')).toBeUndefined();
    expect(map.hasElement(button)).toBe(false);
    expect(map.size).toBe(0);
  });

  it('replaces an existing element when the id is reused', () => {
    const map = new PopupTriggerMap();
    const first = document.createElement('button');
    const second = document.createElement('button');

    map.add('trigger', first);
    map.add('trigger', second);

    expect(map.getById('trigger')).toBe(second);
    expect(map.hasElement(first)).toBe(false);
    expect(map.hasElement(second)).toBe(true);
    expect(map.size).toBe(1);
  });
});

describe('FloatingRootStore', () => {
  function createStore(overrides: Partial<ConstructorParameters<typeof FloatingRootStore>[0]> = {}) {
    return new FloatingRootStore({
      open: false,
      transitionStatus: undefined,
      referenceElement: null,
      floatingElement: null,
      triggerElements: new PopupTriggerMap(),
      floatingId: undefined,
      syncOnly: false,
      nested: false,
      onOpenChange: undefined,
      ...overrides,
    });
  }

  it('setOpen dispatches an openchange event and calls onOpenChange', () => {
    const onOpenChange = vi.fn();
    const store = createStore({ onOpenChange });
    const emitted: any[] = [];
    store.context.events.on('openchange', (details) => emitted.push(details));

    const details = createChangeEventDetails(REASONS.triggerPress, new MouseEvent('click'));
    store.setOpen(true, details);

    expect(onOpenChange).toHaveBeenCalledWith(true, details);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      open: true,
      reason: REASONS.triggerPress,
      nested: false,
    });
  });

  it('syncOnly forwards to onOpenChange without dispatching an openchange event', () => {
    const onOpenChange = vi.fn();
    const store = createStore({ onOpenChange, syncOnly: true });
    const emitted: any[] = [];
    store.context.events.on('openchange', (details) => emitted.push(details));

    store.setOpen(true, createChangeEventDetails(REASONS.none));

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveLength(0);
  });
});

describe('FloatingTree', () => {
  it('registers a node on creation and removes it when the scope is disposed', () => {
    const tree = new FloatingTreeStore();

    createRoot((disposeChild) => {
      const id = useFloatingNodeId(tree);
      expect(tree.nodesRef.current).toHaveLength(1);
      expect(tree.nodesRef.current[0]).toMatchObject({ id, parentId: null });
      disposeChild();
    });

    expect(tree.nodesRef.current).toHaveLength(0);
  });
});

describe('useFloatingRootContext', () => {
  it('syncs a controlled open accessor into the store', () => {
    createRoot((dispose) => {
      const [open, setOpen] = createSignal(false);
      const store = useFloatingRootContext({ open });

      expect(store.state.open).toBe(false);
      setOpen(true);
      expect(store.state.open).toBe(true);

      dispose();
    });
  });

  it('syncs externally provided reference elements, leaving undefined ones alone', () => {
    createRoot((dispose) => {
      const button = document.createElement('button');
      const store = useFloatingRootContext({ elements: { reference: () => button } });

      expect(store.state.referenceElement).toBe(button);
      expect(store.state.domReferenceElement).toBe(button);
      // Floating element wasn't provided, so it stays whatever it started as.
      expect(store.state.floatingElement).toBeNull();

      dispose();
    });
  });

  it('round-trips open state through store.setOpen -> onOpenChange -> the caller signal', () => {
    createRoot((dispose) => {
      const [open, setOpen] = createSignal(false);
      const onOpenChange = vi.fn((next: boolean) => setOpen(next));
      const store = useFloatingRootContext({ open, onOpenChange });

      const details = createChangeEventDetails(REASONS.triggerPress, new MouseEvent('click'));
      store.setOpen(true, details);

      expect(onOpenChange).toHaveBeenCalledWith(true, details);
      expect(store.state.open).toBe(true);

      dispose();
    });
  });
});

describe('usePosition', () => {
  it('starts unpositioned and resets isPositioned to false while closed', async () => {
    let result: ReturnType<typeof usePosition> | undefined;

    function Test(props: { open: Accessor<boolean> }) {
      const [reference, setReference] = createSignal<HTMLElement | null>(null);
      const [floating, setFloating] = createSignal<HTMLElement | null>(null);
      const open = () => props.open();
      result = usePosition({ open, elements: { reference, floating } });
      return (
        <>
          <button ref={setReference}>reference</button>
          <div ref={setFloating}>floating</div>
        </>
      );
    }

    const [open, setOpen] = createSignal(true);
    render(() => <Test open={open} />);

    expect(result!.isPositioned()).toBe(false);
    await flushMicrotasks();
    expect(result!.isPositioned()).toBe(true);

    setOpen(false);
    expect(result!.isPositioned()).toBe(false);
  });

  it('produces transform-based floating styles once the floating element mounts', async () => {
    let result: ReturnType<typeof usePosition> | undefined;

    function Test() {
      const [reference, setReference] = createSignal<HTMLElement | null>(null);
      const [floating, setFloating] = createSignal<HTMLElement | null>(null);
      result = usePosition({ elements: { reference, floating } });
      return (
        <>
          <button ref={setReference}>reference</button>
          <div ref={setFloating}>floating</div>
        </>
      );
    }

    render(() => <Test />);
    await flushMicrotasks();

    const styles = result!.floatingStyles();
    expect(styles.position).toBe('absolute');
    expect(styles.transform).toMatch(/^translate\(/);
  });
});

describe('useFloating', () => {
  it('wires refs.setReference/setFloating and applies position styles to the DOM', async () => {
    function Test() {
      const floating = useFloating({ open: () => true });
      return (
        <>
          <button ref={floating.refs.setReference}>reference</button>
          <div ref={floating.refs.setFloating} data-testid="floating" style={floating.floatingStyles()}>
            floating
          </div>
        </>
      );
    }

    const { getByTestId } = render(() => <Test />);
    await flushMicrotasks();

    const floatingEl = getByTestId('floating');
    expect(floatingEl.style.position).toBe('absolute');
  });

  it('exposes context.onOpenChange as store.setOpen, forwarding event details', () => {
    const onOpenChange = vi.fn();
    let context: UseFloatingReturn['context'] | undefined;

    function Test() {
      const floating = useFloating({ open: () => false, onOpenChange });
      context = floating.context;
      return null;
    }

    render(() => <Test />);

    const details = createChangeEventDetails(REASONS.triggerPress, new MouseEvent('click'));
    context!.onOpenChange(true, details);

    expect(onOpenChange).toHaveBeenCalledWith(true, details);
  });

  it('assigns the floating context onto the tree node when nodeId is provided', () => {
    const tree = new FloatingTreeStore();
    let nodeId: string | undefined;

    function Test() {
      nodeId = useFloatingNodeId(tree);
      const floating = useFloating({ nodeId, externalTree: tree });
      return (
        <div ref={floating.refs.setFloating}>floating</div>
      );
    }

    render(() => <Test />);

    const node = tree.nodesRef.current.find((n) => n.id === nodeId);
    expect(node?.context).toBeDefined();
    expect(node?.context?.nodeId).toBe(nodeId);
  });
});
