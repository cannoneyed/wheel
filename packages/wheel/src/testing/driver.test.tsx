// @vitest-environment jsdom
/**
 * The wheel driver against a real in-process bridge: a fake `page.evaluate`
 * runs the payload function in this jsdom window, so every driver call
 * exercises the same code path playwright would — including the
 * new-errors-throw contract.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { useContext } from 'solid-js';

import { Service, ServiceProvider, connect, componentRoot, view } from '../core';
import { WheelContext, type WheelContextValue } from '../core/context';
import type { BridgeErrorEntry } from '../core/bridge-contract';
import { installWheelBridge, bridgeErrorFeeds } from '../debug/bridge';

import { wheelDriver, WheelAppError, type DriverPage } from './driver';

class TodoService extends Service {
  readonly items = this.atom<readonly string[]>([], 'items');
  readonly add = this.action((text: string) => this.items.set([...this.items.get(), text]), 'add');
}

const connectTodos = connect('Todos', (c) => {
  const todoService = c.service(TodoService);
  return view({ items: todoService.items.get }, { add: todoService.add });
});

function Todos() {
  const state = connectTodos({});
  return <ul use:componentRoot>{state.items.join(',')}</ul>;
}

/** playwright-shaped evaluate: run the serialized payload against THIS window. */
const fakePage: DriverPage = {
  evaluate: (fn, arg) => Promise.resolve(fn(arg))
};

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
        <Todos />
      </ServiceProvider>
    ),
    host
  );
  const uninstall = installWheelBridge(context, { appId: 'driver-app' });
  teardown = () => {
    uninstall();
    bridgeErrorFeeds.delete('driver-app');
    dispose();
    host.remove();
    teardown = null;
  };
}

describe('wheelDriver', () => {
  afterEach(() => teardown?.());

  it('reads and acts through the bridge round trip', async () => {
    mountApp();
    const wheel = wheelDriver(fakePage);
    expect((await wheel.meta()).appId).toBe('driver-app');
    expect(await wheel.act('Todos', 'add', 'milk')).toEqual({ ok: true, result: null });
    expect((await wheel.component('Todos'))!.state.items).toEqual(['milk']);
    expect((await wheel.components())[0].name).toBe('Todos');
    expect(await wheel.settle()).toMatchObject({ settled: true });
  });

  it('throws WheelAppError when the app captured new errors during a call', async () => {
    mountApp();
    const buffer: BridgeErrorEntry[] = [];
    bridgeErrorFeeds.set('driver-app', () => [...buffer]);
    const wheel = wheelDriver(fakePage);
    await wheel.meta(); // baseline: cursor at 0 errors

    buffer.push({ id: 'err_1', message: 'boom', stack: ['at Todos (todos.tsx:3)'], at: 1 });
    await expect(wheel.find('Todos')).rejects.toThrow(WheelAppError);

    // The cursor advanced — the same error does not re-throw.
    expect(await wheel.find('Todos')).toHaveLength(1);
  });

  it('ignoreAppErrors defers to manual newErrors()', async () => {
    mountApp();
    const buffer: BridgeErrorEntry[] = [];
    bridgeErrorFeeds.set('driver-app', () => [...buffer]);
    const wheel = wheelDriver(fakePage, { ignoreAppErrors: true });
    await wheel.meta();

    buffer.push({ id: 'err_1', message: 'boom', stack: [], at: 1 });
    await wheel.find('Todos'); // does not throw
    const fresh = await wheel.newErrors();
    expect(fresh).toHaveLength(0); // find() already drained the cursor
    buffer.push({ id: 'err_2', message: 'boom again', stack: [], at: 2 });
    expect(await wheel.newErrors()).toMatchObject([{ id: 'err_2' }]);
  });

  it('fails with a pointed message when the bridge is missing', async () => {
    const wheel = wheelDriver(fakePage);
    // No app mounted: __wheel may exist from other tests but holds no apps.
    await expect(wheel.meta()).rejects.toThrow(/no wheel app|__wheel is not installed/);
  });
});
