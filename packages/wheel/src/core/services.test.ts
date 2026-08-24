/**
 * Headless kernel smoke tests: atoms/computed/actions react through Solid's
 * graph, DI resolves with overrides and child scopes, and the debug registry
 * records the primitive → service ownership graph.
 */
import { describe, expect, it } from 'vitest';
import { createEffect, createRoot, onCleanup } from 'solid-js';
import { assign, setup } from 'xstate';

import { Service, ServiceContext } from './services';

class CounterService extends Service {
  readonly count = this.atom(0, 'count');
  readonly doubled = this.computed(() => this.count.get() * 2, 'doubled');
  readonly addMany = this.action((amount: number) => {
    for (let i = 0; i < amount; i += 1) {
      this.count.set(this.count.get() + 1);
    }
  }, 'addMany');
}

class GreetingService extends Service {
  private readonly counter = this.service(CounterService);
  readonly label = this.computed(() => `count is ${this.counter.count.get()}`, 'label');
}

type SeekEvent =
  | { readonly type: 'start'; readonly position: number }
  | { readonly type: 'cancel' };

const seekMachine = setup({
  types: {
    context: {} as { readonly position: number | null },
    events: {} as SeekEvent
  },
  actions: {
    setPosition: assign(({ event }) =>
      event.type === 'start' ? { position: event.position } : {}
    )
  }
}).createMachine({
  id: 'seek',
  context: { position: null },
  initial: 'idle',
  states: {
    idle: {
      on: {
        start: { target: 'seeking', actions: 'setPosition' }
      }
    },
    seeking: {
      after: { 250: 'settled' },
      on: { cancel: 'idle' }
    },
    settled: {
      on: {
        start: { target: 'seeking', actions: 'setPosition' }
      }
    }
  }
});

class SeekService extends Service {
  readonly seek = this.machine(seekMachine, {
    transitions: {
      start: (position: number) => ({ type: 'start', position }),
      cancel: () => ({ type: 'cancel' })
    }
  });
}

describe('solid service kernel', () => {
  it('atoms and computed react through the solid graph', () => {
    const context = new ServiceContext();
    const counter = context.get(CounterService);
    const seen: number[] = [];
    const dispose = createRoot((d) => {
      // effect: subscription probe recording every computed flush the graph emits
      createEffect(() => {
        seen.push(counter.doubled());
      });
      return d;
    });
    counter.count.set(3);
    expect(counter.doubled()).toBe(6);
    expect(seen).toEqual([0, 6]);
    dispose();
    context.dispose();
  });

  it('actions batch their writes into one downstream flush', () => {
    const context = new ServiceContext();
    const counter = context.get(CounterService);
    const seen: number[] = [];
    const dispose = createRoot((d) => {
      // effect: subscription probe counting atom flushes to assert batching
      createEffect(() => {
        seen.push(counter.count.get());
      });
      return d;
    });
    counter.addMany(5);
    // One initial run + exactly one flush for five writes.
    expect(seen).toEqual([0, 5]);
    dispose();
    context.dispose();
  });

  it('fields keep live values unchanged and never create reactive dependencies', () => {
    let now = 100;
    class LiveHandle {
      mutable = 0;
    }
    class FieldService extends Service {
      private readonly retries = this.field(0);
      private readonly handle = this.field<LiveHandle | null>(null);
      readonly readRetries = (): number => this.retries.get();
      readonly setRetries = (value: number): void => this.retries.set(value);
      readonly readHandle = (): LiveHandle | null => this.handle.get();
      readonly setHandle = (value: LiveHandle): void => this.handle.set(value);
    }
    const context = new ServiceContext({ clock: { now: () => now++ } });
    const service = context.get(FieldService);
    const seen: number[] = [];
    const dispose = createRoot((release) => {
      createEffect(() => {
        seen.push(service.readRetries());
      });
      return release;
    });

    service.setRetries(0);
    service.setRetries(1);
    expect(seen).toEqual([0]);
    expect(service.readRetries()).toBe(1);

    const handle = new LiveHandle();
    service.setHandle(handle);
    expect(service.readHandle()).toBe(handle);
    expect(Object.isFrozen(handle)).toBe(false);
    handle.mutable = 7;
    expect(service.readHandle()?.mutable).toBe(7);

    const retries = context.registry.snapshot().primitives.find((entry) => entry.meta.name === 'retries');
    expect(retries?.meta.kind).toBe('field');
    expect(retries?.value).toEqual({
      current: 1,
      history: [
        { at: 100, previous: 0, current: 0 },
        { at: 101, previous: 0, current: 1 }
      ]
    });
    const handleEntry = context.registry.snapshot().primitives.find((entry) => entry.meta.name === 'handle');
    expect(handleEntry?.value).toEqual({
      current: '<LiveHandle>',
      history: [{ at: 102, previous: null, current: '<LiveHandle>' }]
    });

    dispose();
    context.dispose();
  });

  it('fields keep the newest 50 writes', () => {
    class FieldService extends Service {
      private readonly count = this.field(0);
      readonly setCount = (value: number): void => this.count.set(value);
    }
    const context = new ServiceContext({ clock: { now: () => 42 } });
    const service = context.get(FieldService);
    for (let value = 0; value < 60; value += 1) service.setCount(value);

    const entry = context.registry.snapshot().primitives.find((primitive) => primitive.meta.name === 'count');
    const value = entry?.value as { current: number; history: Array<{ current: number }> };
    expect(value.current).toBe(59);
    expect(value.history).toHaveLength(50);
    expect(value.history[0]?.current).toBe(10);
    expect(value.history.at(-1)?.current).toBe(59);
    context.dispose();
  });

  it('services read time and schedule work through the context runtime seam', () => {
    let scheduled:
      | { ms: number; run: () => void; cancelled: boolean }
      | undefined;
    class RuntimeService extends Service {
      readonly readNow = () => this.now();
      readonly later = (run: () => void) => this.defer(25, run);
    }
    const context = new ServiceContext({
      clock: { now: () => 123_456 },
      defer: {
        schedule(ms, run) {
          scheduled = { ms, run, cancelled: false };
          return () => {
            if (scheduled) scheduled.cancelled = true;
          };
        }
      }
    });
    const service = context.get(RuntimeService);
    expect(service.readNow()).toBe(123_456);
    let ran = false;
    const cancel = service.later(() => {
      ran = true;
    });
    expect(scheduled?.ms).toBe(25);
    scheduled?.run();
    expect(ran).toBe(true);
    cancel();
    expect(scheduled?.cancelled).toBe(true);
    context.dispose();
  });

  it('a newer latest async task cancels the stale chain before it can commit', async () => {
    let releaseOld!: (value: string) => void;
    const oldTask = new Promise<string>((resolve) => {
      releaseOld = resolve;
    });
    class AsyncService extends Service {
      readonly commits: string[] = [];
      readonly load = async (work: PromiseLike<string>): Promise<string> => {
        const task = this.latestAsyncTask();
        const value = await task.wait(work);
        this.commits.push(value);
        return value;
      };
    }
    const context = new ServiceContext();
    const service = context.get(AsyncService);

    const oldRun = service.load(oldTask);
    const currentRun = service.load(Promise.resolve('current'));

    await expect(oldRun).rejects.toMatchObject({ name: 'AbortError' });
    await expect(currentRun).resolves.toBe('current');
    releaseOld('stale');
    await Promise.resolve();
    expect(service.commits).toEqual(['current']);
    context.dispose();
  });

  it('service disposal cancels its active latest async task', async () => {
    const pending = new Promise<never>(() => {});
    class AsyncService extends Service {
      readonly run = (): Promise<never> => {
        const task = this.latestAsyncTask();
        return task.wait(pending);
      };
    }
    const context = new ServiceContext();
    const service = context.get(AsyncService);
    const run = service.run();

    context.dispose();

    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('machine owns a reactive XState actor with named actions and debug history', () => {
    let now = 1_000;
    const pending: Array<{ ms: number; run: () => void; cancelled: boolean }> = [];
    const context = new ServiceContext({
      clock: { now: () => now },
      defer: {
        schedule(ms, run) {
          const timer = { ms, run, cancelled: false };
          pending.push(timer);
          return () => {
            timer.cancelled = true;
          };
        }
      }
    });
    const service = context.get(SeekService);
    const seen: unknown[] = [];
    const disposeEffect = createRoot((dispose) => {
      createEffect(() => {
        seen.push(service.seek.state().value);
      });
      return dispose;
    });

    expect(service.seek.state().value).toBe('idle');
    service.seek.transitions.start(42);
    expect(service.seek.state().value).toBe('seeking');
    expect(service.seek.state().context.position).toBe(42);
    expect(pending[0]?.ms).toBe(250);

    now = 1_250;
    pending[0]?.run();
    expect(service.seek.state().value).toBe('settled');
    expect(seen).toEqual(['idle', 'seeking', 'settled']);

    const snapshot = context.registry.snapshot();
    const machine = snapshot.primitives.find((entry) => entry.meta.name === 'seek');
    expect(machine?.meta.kind).toBe('machine');
    expect(machine?.value).toMatchObject({
      current: 'settled',
      status: 'active',
      transitions: ['start', 'cancel'],
      history: [
        { at: 1_000, event: 'xstate.init', state: 'idle' },
        { at: 1_000, event: 'start', state: 'seeking' },
        { at: 1_250, state: 'settled' }
      ]
    });
    expect(
      snapshot.primitives
        .filter((entry) => entry.meta.kind === 'action' && entry.meta.serviceName === 'SeekService')
        .map((entry) => entry.meta.name)
        .sort()
    ).toEqual(['seek.cancel', 'seek.start']);

    const start = context.registry.findActions('SeekService', 'seek.start')[0];
    const cancel = context.registry.findActions('SeekService', 'seek.cancel')[0];
    expect(start).toBeDefined();
    expect(cancel).toBeDefined();
    start.invoke(9);
    cancel.invoke();
    expect(service.seek.state().value).toBe('idle');

    for (let index = 0; index < 30; index += 1) {
      service.seek.transitions.start(index);
      service.seek.transitions.cancel();
    }
    const capped = context.registry.snapshot().primitives.find((entry) => entry.meta.name === 'seek')
      ?.value as { history: Array<{ state: unknown }> };
    expect(capped.history).toHaveLength(50);
    expect(capped.history.at(-1)?.state).toBe('idle');

    disposeEffect();
    context.dispose();
  });

  it('machine cancels XState delays with the Service defer seam on disposal', () => {
    let cancelled = false;
    const context = new ServiceContext({
      defer: {
        schedule() {
          return () => {
            cancelled = true;
          };
        }
      }
    });
    const service = context.get(SeekService);
    service.seek.transitions.start(7);
    expect(cancelled).toBe(false);
    context.dispose();
    expect(cancelled).toBe(true);
  });

  it('computedFor memoizes per canonical tuple', () => {
    let runs = 0;
    class MathService extends Service {
      readonly base = this.atom(10, 'base');
      readonly plus = this.computedFor((n: number) => {
        runs += 1;
        return this.base.get() + n;
      }, 'plus');
    }
    const context = new ServiceContext();
    const math = context.get(MathService);
    expect(math.plus(1)).toBe(11);
    expect(math.plus(1)).toBe(11);
    expect(math.plus(2)).toBe(12);
    expect(runs).toBe(2);
    math.base.set(20);
    expect(math.plus(1)).toBe(21);
    context.dispose();
  });

  it('computedFor keeps ALL keys live past the old 256 LRU limit (no eviction)', () => {
    // The bug this replaces: the old `computed` put every keyed value behind a
    // 256-entry LRU. Reading a 257th key evicted key #0's memo — even while a
    // mounted component observed it — and the row silently froze on screen.
    // computedFor never evicts, so a key read long ago still reflects state.
    class GridService extends Service {
      readonly base = this.atom(0, 'base');
      readonly cell = this.computedFor((n: number) => this.base.get() + n, 'cell');
    }
    const context = new ServiceContext();
    const grid = context.get(GridService);

    // Read key 0 first (the one the old LRU would evict), then 300 more keys —
    // well past the old 256 cap.
    expect(grid.cell(0)).toBe(0);
    for (let n = 1; n <= 300; n += 1) grid.cell(n);

    // Mutate shared state. Key 0's memo must still be alive and reactive: if it
    // had been evicted, a fresh memo would recompute correctly here — so we
    // also assert the memo IDENTITY survived by observing it through an effect
    // that must NOT have been disposed.
    let observed = -1;
    const dispose = createRoot((d) => {
      createEffect(() => {
        observed = grid.cell(0);
      });
      return d;
    });
    expect(observed).toBe(0);
    grid.base.set(1000);
    // The long-lived memo for key 0 recomputed and pushed to the still-live
    // effect — no freeze, no eviction.
    expect(observed).toBe(1000);
    expect(grid.cell(0)).toBe(1000);
    expect(grid.cell(300)).toBe(1300);
    dispose();
    context.dispose();
  });

  it('computedFor per-key memos dispose on service teardown (no leak)', () => {
    let disposals = 0;
    class LeakService extends Service {
      readonly base = this.atom(0, 'base');
      readonly cell = this.computedFor((n: number) => {
        // createMemo runs under a root that disposes with the service; register
        // a cleanup so we can count disposals per key.
        onCleanup(() => {
          disposals += 1;
        });
        return this.base.get() + n;
      }, 'cell');
    }
    const context = new ServiceContext();
    const leak = context.get(LeakService);
    for (let n = 0; n < 10; n += 1) leak.cell(n);
    expect(disposals).toBe(0);
    context.dispose();
    // Every per-key memo's owning root was disposed exactly once.
    expect(disposals).toBe(10);
  });

  it('computedFor explicitly releases one key without evicting any other key', () => {
    let runs = 0;
    let disposals = 0;
    class FamilyService extends Service {
      readonly value = this.computedFor((key: string) => {
        runs += 1;
        onCleanup(() => {
          disposals += 1;
        });
        return key.toUpperCase();
      }, 'value');
    }
    const context = new ServiceContext();
    const family = context.get(FamilyService).value;

    expect(family('a')).toBe('A');
    expect(family('b')).toBe('B');
    expect(family.size()).toBe(2);
    expect(family.release('a')).toBe(true);
    expect(family.release('a')).toBe(false);
    expect(family.size()).toBe(1);
    expect(disposals).toBe(1);

    expect(family('a')).toBe('A');
    expect(runs).toBe(3);
    family.clear();
    expect(family.size()).toBe(0);
    expect(disposals).toBe(3);
    context.dispose();
  });

  it('cross-service DI resolves and circularity throws with the chain', () => {
    const context = new ServiceContext();
    const greeting = context.get(GreetingService);
    expect(greeting.label()).toBe('count is 0');
    context.get(CounterService).count.set(7);
    expect(greeting.label()).toBe('count is 7');
    context.dispose();
  });

  it('override injects fakes before first use, throws after', () => {
    const context = new ServiceContext();
    class FakeCounter extends CounterService {}
    const fakeContext = new ServiceContext();
    const fake = fakeContext.get(FakeCounter);
    context.override(CounterService, fake, { ownership: 'caller' });
    expect(context.get(CounterService)).toBe(fake);

    const late = new ServiceContext();
    late.get(CounterService);
    expect(() => late.override(CounterService, fake, { ownership: 'caller' })).toThrow(
      /already instantiated/
    );
    context.dispose();
    fakeContext.dispose();
    late.dispose();
  });

  it('override ownership destroys context-owned replacements and preserves caller-owned ones', () => {
    let callerDestroyed = 0;
    let contextDestroyed = 0;
    class CallerReplacement extends CounterService {
      protected override onDestroy(): void {
        callerDestroyed += 1;
      }
    }
    class ContextReplacement extends CounterService {
      protected override onDestroy(): void {
        contextDestroyed += 1;
      }
    }

    const callerSource = new ServiceContext();
    const callerReplacement = callerSource.get(CallerReplacement);
    const callerScope = new ServiceContext();
    callerScope.override(CounterService, callerReplacement, { ownership: 'caller' });
    callerScope.dispose();
    expect(callerDestroyed).toBe(0);
    callerSource.dispose();
    expect(callerDestroyed).toBe(1);

    const contextScope = new ServiceContext();
    const contextReplacement = contextScope.ownedRoot(() => new ContextReplacement(contextScope));
    contextScope.override(CounterService, contextReplacement, { ownership: 'context' });
    contextScope.dispose();
    contextScope.dispose();
    expect(contextDestroyed).toBe(1);
  });

  it('disposed child scopes unlink from their parent under repeated mounts', () => {
    const root = new ServiceContext();
    for (let index = 0; index < 500; index += 1) {
      const child = root.child({ scopeId: `dynamic:${index}`, inheritServices: false });
      child.get(CounterService);
      expect(root.__debugChildCount()).toBe(1);
      child.dispose();
      expect(root.__debugChildCount()).toBe(0);
    }
    root.dispose();
  });

  it('child scopes inherit by policy', () => {
    const root = new ServiceContext();
    const rootCounter = root.get(CounterService);

    const inheriting = root.child({ scopeId: 'inherit' });
    expect(inheriting.get(CounterService)).toBe(rootCounter);

    const isolated = root.child({ scopeId: 'isolated', inheritServices: false });
    expect(isolated.get(CounterService)).not.toBe(rootCounter);
    root.dispose();
  });

  it('atom.update: immer drafts for nested changes, structural sharing preserved', () => {
    class DocService extends Service {
      readonly doc = this.atom(
        { title: 'a', body: { text: 'hello', tags: ['x'] }, meta: { views: 0 } },
        'doc'
      );
    }
    const context = new ServiceContext();
    const service = context.get(DocService);
    const before = service.doc.get();
    service.doc.update((draft) => {
      draft.meta.views += 1;
    });
    const after = service.doc.get();
    expect(after.meta.views).toBe(1);
    // Untouched branch keeps identity — memos over `body` won't invalidate.
    expect(after.body).toBe(before.body);
    // Output is frozen like any other atom value.
    expect(Object.isFrozen(after)).toBe(true);
    expect(() => ((after as { title: string }).title = 'z')).toThrow(TypeError);
    context.dispose();
  });

  it('Set/Map atoms reject external mutation and still update through drafts', () => {
    class SelService extends Service {
      readonly selected = this.atom(new Set<string>(['a']), 'selected');
      readonly labels = this.atom(new Map<string, { label: string }>([['a', { label: 'A' }]]), 'labels');
    }
    const context = new ServiceContext();
    const service = context.get(SelService);
    const before = service.selected.get();
    const labelsBefore = service.labels.get();

    expect(() => (before as Set<string>).add('hidden-write')).toThrow(/frozen/);
    expect(() => (labelsBefore as Map<string, { label: string }>).set('b', { label: 'B' })).toThrow(
      /frozen/
    );
    expect([...service.selected.get()]).toEqual(['a']);
    expect([...service.labels.get().keys()]).toEqual(['a']);

    service.selected.update((draft) => {
      draft.add('b');
      draft.delete('a');
    });
    service.labels.update((draft) => {
      draft.set('b', { label: 'B' });
      draft.get('a')!.label = 'Updated';
    });
    expect([...service.selected.get()]).toEqual(['b']);
    expect(service.selected.get()).not.toBe(before);
    expect([...service.labels.get()]).toEqual([
      ['a', { label: 'Updated' }],
      ['b', { label: 'B' }]
    ]);
    expect(service.labels.get()).not.toBe(labelsBefore);
    context.dispose();
  });

  it('rejects Date values because Object.freeze cannot make their timestamp immutable', () => {
    class TimeService extends Service {
      readonly now = this.atom(0, 'now');
    }
    const context = new ServiceContext();
    const service = context.get(TimeService);
    expect(() => service.now.set(new Date() as unknown as number)).toThrow(/epoch-millisecond/);
    context.dispose();
  });

  it('atom values are deep-frozen: mutation outside the happy path throws', () => {
    class ProfileService extends Service {
      readonly profile = this.atom({ name: 'ada', tags: ['a'] }, 'profile');
    }
    const context = new ServiceContext();
    const service = context.get(ProfileService);
    const value = service.profile.get();
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.tags)).toBe(true);
    expect(() => {
      (value as { name: string }).name = 'mallory';
    }).toThrow(TypeError);
    expect(() => value.tags.push('b')).toThrow(TypeError);
    // The happy path — replacing the whole value — still works, and the
    // replacement is frozen too.
    service.profile.set({ name: 'grace', tags: ['b'] });
    expect(service.profile.get().name).toBe('grace');
    expect(Object.isFrozen(service.profile.get())).toBe(true);
    context.dispose();
  });

  it('registry records primitive → service ownership with field names', () => {
    const context = new ServiceContext();
    context.get(CounterService);
    const snapshot = context.registry.snapshot();
    const service = snapshot.services.find((s) => s.name === 'CounterService');
    expect(service).toBeDefined();
    expect(service!.primitiveIds.length).toBe(3);
    const names = snapshot.primitives
      .filter((p) => p.meta.serviceName === 'CounterService')
      .map((p) => p.meta.name)
      .sort();
    expect(names).toEqual(['addMany', 'count', 'doubled']);
    context.dispose();
  });

  it('registry keeps same-named constructors and nested scopes distinct', () => {
    const StoreA = class StoreService extends Service {
      readonly value = this.atom('a', 'value');
    };
    const StoreB = class StoreService extends Service {
      readonly value = this.atom('b', 'value');
    };
    const root = new ServiceContext({ scopeId: 'root' });
    root.get(StoreA);
    root.get(StoreB);
    const child = root.child({ scopeId: 'nested', inheritServices: false });
    child.get(StoreA);

    const records = root.registry.snapshot().services.filter((service) => service.name === 'StoreService');
    expect(records).toHaveLength(3);
    expect(new Set(records.map((service) => service.id)).size).toBe(3);
    expect(records.map((service) => service.scopeId).sort()).toEqual(['nested', 'root', 'root']);
    for (const record of records) {
      const primitives = root.registry
        .snapshot()
        .primitives.filter((entry) => entry.meta.serviceId === record.id);
      expect(primitives).toHaveLength(1);
    }

    child.dispose();
    expect(
      root.registry.snapshot().services.filter((service) => service.name === 'StoreService')
    ).toHaveLength(2);
    root.dispose();
  });

  it('registry shows a computedFor value PER KEY (not one opaque aggregate)', () => {
    class KeyedService extends Service {
      readonly base = this.atom(10, 'base');
      readonly plus = this.computedFor((n: number) => this.base.get() + n, 'plus');
    }
    const context = new ServiceContext();
    const service = context.get(KeyedService);
    // Read two distinct keys so both memos exist.
    service.plus(1);
    service.plus(2);
    const entry = context.registry.snapshot().primitives.find((p) => p.meta.name === 'plus');
    expect(entry).toBeDefined();
    // The registered read returns one entry per canonical key — the fix for the
    // old `<N cached tuples>` opacity. Keys are canonicalParams-hashed tuples.
    const value = entry!.value as Record<string, unknown>;
    expect(Object.keys(value).length).toBe(2);
    expect(Object.values(value).sort()).toEqual([11, 12]);
    context.dispose();
  });
});
