// @vitest-environment jsdom
/**
 * Component-level kernel tests: connect and the stub tiers, all rendered into
 * a real DOM. These are the binding probes for the doctrine — one connect per
 * component, stubs for sandboxes with zero providers.
 */
import { createSignal, Show, useContext } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';

import {
  Service,
  ServiceProvider,
  StubProvider,
  connect,
  fakeService,
  stubOf,
  useDebugSnapshot,
  view
} from './index';
import { WheelContext } from './context';
import type { ServiceContext } from './services';

class CounterService extends Service {
  readonly count = this.atom(0, 'count');
  readonly doubled = this.computed(() => this.count.get() * 2, 'doubled');
  readonly add = this.action((n: number) => this.count.set(this.count.get() + n), 'add');
}

const connectCounterView = connect('CounterView', (c) => {
  const counterService = c.service(CounterService);
  return {
    get count() {
      return counterService.count.get();
    },
    get doubled() {
      return counterService.doubled();
    },
    add: counterService.add
  };
});

function CounterView() {
  const state = connectCounterView({});
  return (
    <div>
      <span data-testid="count">{state.count}</span>
      <span data-testid="doubled">{state.doubled}</span>
      <button data-testid="add" onClick={() => state.add(2)}>
        add
      </button>
    </div>
  );
}

function mount(element: () => ReturnType<typeof CounterView>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const dispose = render(element, host);
  return {
    host,
    cleanup: () => {
      dispose();
      host.remove();
    }
  };
}

describe('connect in the DOM', () => {
  it('dynamic ServiceProvider mounts unlink every disposed child scope', () => {
    let rootContext: ServiceContext | undefined;
    const [mounted, setMounted] = createSignal(false);

    function CaptureRoot() {
      rootContext = useContext(WheelContext)?.services;
      return null;
    }

    const { cleanup } = mount(() => (
      <ServiceProvider scopeId="mount-stress">
        <CaptureRoot />
        <Show when={mounted()}>
          <ServiceProvider scopeId="dynamic-child">
            <span>mounted</span>
          </ServiceProvider>
        </Show>
      </ServiceProvider>
    ));
    try {
      for (let index = 0; index < 100; index += 1) {
        setMounted(true);
        expect(rootContext!.__debugChildCount()).toBe(1);
        setMounted(false);
        expect(rootContext!.__debugChildCount()).toBe(0);
      }
    } finally {
      cleanup();
    }
  });

  it('renders service state and reacts to actions', () => {
    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="t1">
        <CounterView />
      </ServiceProvider>
    ));
    try {
      expect(host.querySelector('[data-testid=count]')!.textContent).toBe('0');
      (host.querySelector('[data-testid=add]') as HTMLButtonElement).click();
      expect(host.querySelector('[data-testid=count]')!.textContent).toBe('2');
      expect(host.querySelector('[data-testid=doubled]')!.textContent).toBe('4');
    } finally {
      cleanup();
    }
  });

  it('atoms and live-view objects connect DIRECTLY through view() — no mirror wrappers', () => {
    class DirectService extends Service {
      // Public atom, connected directly — the deleted pattern was a mirror:
      // `readonly filterMirror = this.computed(() => this.filter.get())`.
      readonly filter = this.atom(1, 'filter');
      private readonly rowsAtom = this.atom<readonly string[]>(['a'], 'rows');
      /** Stands in for a LiveQueryView: an object whose getters defer reads. */
      readonly listLike = ((rows = this.rowsAtom) => ({
        get rows(): readonly string[] {
          return rows.get();
        }
      }))();
      readonly vmFor = this.computedFor((id: number) => id * this.filter.get(), 'vmFor');
      readonly setFilter = this.action((n: number) => this.filter.set(n), 'setFilter');
      readonly addRow = this.action(
        (row: string) => this.rowsAtom.set([...this.rowsAtom.get(), row]),
        'addRow'
      );
    }

    const connectDirectView = connect('DirectView', (c, props: { id: number }) => {
      const directService = c.service(DirectService);
      return view(
        {
          filter: directService.filter, // atom, direct — value read, tracked
          list: directService.listLike, // view object, direct — getters stay live
          vm: () => directService.vmFor(props.id) // keyed derivation, per key
        },
        { setFilter: directService.setFilter, addRow: directService.addRow }
      );
    });

    function DirectView(props: { id: number }) {
      const state = connectDirectView(props);
      return (
        <div>
          <span data-testid="filter">{state.filter}</span>
          <span data-testid="rows">{state.list.rows.join(',')}</span>
          <span data-testid="vm">{state.vm}</span>
          <button data-testid="bump" onClick={() => state.setFilter(3)}>
            bump
          </button>
          <button data-testid="grow" onClick={() => state.addRow('b')}>
            grow
          </button>
        </div>
      );
    }

    const { host, cleanup } = mount(() => (
      <ServiceProvider scopeId="direct">
        <DirectView id={7} />
      </ServiceProvider>
    ));
    try {
      expect(host.querySelector('[data-testid=filter]')!.textContent).toBe('1');
      expect(host.querySelector('[data-testid=rows]')!.textContent).toBe('a');
      expect(host.querySelector('[data-testid=vm]')!.textContent).toBe('7');
      (host.querySelector('[data-testid=bump]') as HTMLButtonElement).click();
      // The direct atom read AND the per-key derivation both tracked the write.
      expect(host.querySelector('[data-testid=filter]')!.textContent).toBe('3');
      expect(host.querySelector('[data-testid=vm]')!.textContent).toBe('21');
      (host.querySelector('[data-testid=grow]') as HTMLButtonElement).click();
      // The passed-through view object's getter stayed live in the component.
      expect(host.querySelector('[data-testid=rows]')!.textContent).toBe('a,b');
    } finally {
      cleanup();
    }
  });

  it('Tier 1: a stubbed component renders with NO providers at all', () => {
    const calls: number[] = [];
    const { host, cleanup } = mount(() => (
      <StubProvider
        stubs={[stubOf(connectCounterView, { count: 41, doubled: 82, add: (n: number) => calls.push(n) })]}
      >
        <CounterView />
      </StubProvider>
    ));
    try {
      expect(host.querySelector('[data-testid=count]')!.textContent).toBe('41');
      (host.querySelector('[data-testid=add]') as HTMLButtonElement).click();
      expect(calls).toEqual([2]);
    } finally {
      cleanup();
    }
  });

  it('Tier 2: fakeService override feeds every self-connecting descendant', () => {
    const fake = fakeService(CounterService, {
      count: { get: () => 100, set: () => {}, update: () => {}, __debugMeta: undefined! },
      doubled: (() => 200) as CounterService['doubled'],
      add: (() => {}) as CounterService['add']
    });
    const { host, cleanup } = mount(() => (
      <ServiceProvider
        scopeId="t2"
        overrides={[{ original: CounterService, replacement: fake, ownership: 'caller' }]}
      >
        <div>
          <CounterView />
        </div>
      </ServiceProvider>
    ));
    try {
      expect(host.querySelector('[data-testid=count]')!.textContent).toBe('100');
      expect(host.querySelector('[data-testid=doubled]')!.textContent).toBe('200');
    } finally {
      cleanup();
    }
  });
});

describe('useDebugSnapshot', () => {
  const connectLateView = connect('LateView', (c) => {
    const counterService = c.service(CounterService);
    return { get count() { return counterService.count.get(); } };
  });
  function LateView() {
    const state = connectLateView({});
    return <span>{state.count}</span>;
  }

  it('serves observed service reads, and re-reads reactively as later mounts record', () => {
    const [late, setLate] = createSignal(false);
    let names: (() => readonly string[]) | undefined;
    let counterDeps: (() => readonly string[]) | undefined;
    function SnapshotProbe() {
      const snapshot = useDebugSnapshot();
      names = () => snapshot().components.map((component) => component.name);
      counterDeps = () =>
        snapshot().components.find((component) => component.name === 'CounterView')?.dependencies ?? [];
      return null;
    }
    const { cleanup } = mount(() => (
      <ServiceProvider scopeId="probe">
        <CounterView />
        <SnapshotProbe />
        <Show when={late()}>
          <LateView />
        </Show>
      </ServiceProvider>
    ));
    try {
      // The observed manifest a stub-inventory page renders: the sibling's
      // connect and its service reads are in the snapshot.
      expect(names!()).toContain('CounterView');
      expect(counterDeps!().some((dep) => dep.startsWith('service:CounterService'))).toBe(true);
      // Reactive: a component mounting AFTER the first read appears on re-read.
      expect(names!()).not.toContain('LateView');
      setLate(true);
      expect(names!()).toContain('LateView');
    } finally {
      cleanup();
    }
  });

  it('throws outside a provider, matching connect()', () => {
    expect(() => useDebugSnapshot()).toThrow(/outside a WheelProvider\/ServiceProvider/);
  });
});
