// @vitest-environment jsdom
/**
 * The window.__wheel bridge: reads return JSON, actions are the only write
 * door, install is dev-gated, and the multi-app multiplexer routes correctly.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { useContext } from 'solid-js';

import { Service, ServiceProvider, connect, componentRoot, setWheelDevMode, view, viewRoot } from '../core';
import { WheelContext, type WheelContextValue } from '../core/context';
import type { WheelGlobal } from '../core/bridge-contract';

import { installWheelBridge } from './bridge';

class CounterService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'CounterService';

  readonly count = this.atom(0, 'count');
  readonly add = this.action((n: number) => this.count.set(this.count.get() + n), 'add');
}

const connectCounter = connect('Counter', (c) => {
  const counterService = c.service(CounterService);
  return view({ count: counterService.count.get }, { add: counterService.add });
});

function Counter() {
  const state = connectCounter({});
  return <output use:componentRoot>{state.count}</output>;
}

function wheelGlobal(): WheelGlobal {
  return (window as Window & { __wheel?: WheelGlobal }).__wheel!;
}

let active: { cleanup: () => void } | null = null;

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
        <Counter />
      </ServiceProvider>
    ),
    host
  );
  const uninstall = installWheelBridge(context, { appId: 'test-app' });
  const app = {
    host,
    context,
    cleanup: () => {
      uninstall();
      dispose();
      host.remove();
      active = null;
    }
  };
  active = app;
  return app;
}

describe('installWheelBridge', () => {
  afterEach(() => {
    active?.cleanup();
    setWheelDevMode(true);
  });

  it('installs window.__wheel with state, component tree, and meta', () => {
    const app = mountApp();
    const bridge = wheelGlobal();
    expect(bridge.apps()).toEqual(['test-app']);

    const state = bridge.state();
    const counter = state.find((entry) => entry.service === 'CounterService')!;
    expect(counter.primitives).toEqual([
      { id: expect.any(String), name: 'count', kind: 'atom', value: 0 },
      { id: expect.any(String), name: 'add', kind: 'action', value: '<action add>' }
    ]);

    expect(bridge.components()).toEqual([
      { instanceId: 'Counter', name: 'Counter', kind: 'connected', group: 'app', children: [] }
    ]);
    expect(bridge.subscriptions()).toEqual([]);
    expect(bridge.meta()).toMatchObject({ appId: 'test-app', status: 'offline', instances: 1 });
    app.cleanup();
  });

  it('act() invokes a shape action and component() shows the live result', async () => {
    const app = mountApp();
    const bridge = wheelGlobal();
    const result = await bridge.act('Counter', 'add', [5]);
    expect(result).toEqual({ ok: true, result: null });
    expect(bridge.component('Counter')).toMatchObject({ state: { count: 5 }, actions: ['add'] });
    expect(app.host.textContent).toBe('5');

    // Unknown ids fail with suggestions, never throw across the bridge.
    expect(await bridge.act('Countr', 'add', [1])).toMatchObject({ ok: false });
    app.cleanup();
  });

  it('actService() invokes by service + action name', async () => {
    const app = mountApp();
    const bridge = wheelGlobal();
    expect(await bridge.actService('CounterService', 'add', [2])).toEqual({ ok: true, result: null });
    expect(bridge.component('Counter')!.state.count).toBe(2);
    expect(await bridge.actService('CounterService', 'nope', [])).toMatchObject({
      ok: false,
      error: expect.stringContaining('actions()')
    });
    expect(bridge.actions()).toContainEqual({
      service: 'CounterService',
      action: 'add',
      id: expect.any(String),
      serviceId: expect.any(String)
    });
    app.cleanup();
  });

  it('component() never invokes a `children` prop getter (it would mount the subtree)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let context!: WheelContextValue;
    let childrenReads = 0;
    // The shape Solid hands a component: getters, with `children` mounting on
    // read. The bridge (and the panel, via the same helper) must summarize it
    // without ever invoking it — invoking re-created the subtree in a loop
    // and froze the graph demo's page.
    const stageProps = {
      title: 'Graph',
      get children() {
        childrenReads += 1;
        return document.createElement('canvas');
      }
    };
    const Stage = () => <section use:viewRoot={{ name: 'Stage', props: stageProps }} />;
    const dispose = render(
      () => (
        <ServiceProvider>
          {(() => {
            const Probe = () => {
              context = useContext(WheelContext)!;
              return null;
            };
            return <Probe />;
          })()}
          <Stage />
        </ServiceProvider>
      ),
      host
    );
    const uninstall = installWheelBridge(context, { appId: 'test-app' });
    const snapshot = wheelGlobal().component('Stage');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.props).toMatchObject({ title: 'Graph', children: '<jsx children>' });
    expect(childrenReads).toBe(0);
    uninstall();
    dispose();
    host.remove();
  });

  it('find() matches by substring; settle() resolves immediately for clientless apps', async () => {
    const app = mountApp();
    const bridge = wheelGlobal();
    expect(bridge.find('count').map((s) => s.instanceId)).toEqual(['Counter']);
    expect(await bridge.settle()).toMatchObject({ settled: true });
    app.cleanup();
  });

  it('is a no-op outside dev mode', () => {
    setWheelDevMode(false);
    const app = mountApp();
    expect(wheelGlobal()?.apps() ?? []).toEqual([]);
    app.cleanup();
  });

  it('uninstall removes the app from the multiplexer', () => {
    const app = mountApp();
    expect(wheelGlobal().apps()).toEqual(['test-app']);
    app.cleanup();
    expect(wheelGlobal().apps()).toEqual([]);
    expect(() => wheelGlobal().state()).toThrow(/no wheel app bridge/);
  });
});
