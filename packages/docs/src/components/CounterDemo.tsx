/**
 * A live demo running the REAL wheel kernel — not a mock. A clientless
 * ServiceProvider hosts a Service with an atom, a computed, and an action; the
 * component reads it through connect(). This is the exact pattern app code
 * uses, minus the sync client.
 */
import { Show } from 'solid-js';
import { Service, ServiceProvider, componentRoot, connect, useSignal, viewRoot } from 'wheel/core';

class CounterService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'CounterService';

  readonly count = this.atom(0, 'count');
  readonly doubled = this.computed(() => this.count.get() * 2, 'doubled');
  readonly add = this.action((amount: number) => {
    this.count.set(this.count.get() + amount);
  }, 'add');
  readonly reset = this.action(() => this.count.set(0), 'reset');
}

const connectCounterCard = connect('CounterCard', (c) => {
  const counterService = c.service(CounterService);
  return {
    get count() {
      return counterService.count.get();
    },
    get doubled() {
      return counterService.doubled();
    },
    add: counterService.add,
    reset: counterService.reset
  };
});

function CounterCard() {
  const state = connectCounterCard({});
  return (
    <div use:componentRoot>
      <p style="margin-top: 0">
        count is <strong>{state.count}</strong>, doubled is <strong>{state.doubled}</strong>
      </p>
      <button onClick={() => state.add(1)}>+1</button>
      <button onClick={() => state.add(10)}>+10</button>
      <button onClick={() => state.reset()}>reset</button>
    </div>
  );
}

export function CounterDemo() {
  return (
    <div use:viewRoot={'CounterDemo'} class="demo">
      <div class="demo-label">Live demo — real wheel kernel, clientless sandbox</div>
      <ServiceProvider scopeId="docs-counter">
        <CounterCard />
      </ServiceProvider>
    </div>
  );
}

/**
 * Same service, second provider: proves sandbox isolation. The two demos on
 * the page hold independent CounterService singletons because each
 * ServiceProvider is its own DI scope.
 */
export function IsolationDemo() {
  const [mounted, setMounted] = useSignal(true, 'mounted');
  return (
    <div use:viewRoot={'IsolationDemo'} class="demo">
      <div class="demo-label">Live demo — two isolated scopes of the same service</div>
      <div style="display: flex; gap: 24px; align-items: flex-start;">
        <ServiceProvider scopeId="docs-iso-a">
          <CounterCard />
        </ServiceProvider>
        <Show when={mounted()}>
          <ServiceProvider scopeId="docs-iso-b">
            <CounterCard />
          </ServiceProvider>
        </Show>
      </div>
      <button style="margin-top: 12px" onClick={() => setMounted(!mounted())}>
        {mounted() ? 'unmount second scope' : 'remount second scope'}
      </button>
    </div>
  );
}
