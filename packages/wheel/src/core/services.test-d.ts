/**
 * Type-level pins for Service primitive APIs.
 *
 * `computed(fn)` is a PLAIN derivation — its callback takes no arguments,
 * and the old parameterized overload (with its hidden 256-entry LRU and the
 * eviction bug) is gone for good. `computedFor` is the keyed form, callable
 * with arguments — one live memo per canonical arg tuple.
 *
 * This file is typechecked by vitest (`typecheck` in vitest.config.ts) and
 * never executed. Every `@ts-expect-error` is a tripwire: if the marked line
 * ever stops being a type error, tsc reports the directive as unused and the
 * suite fails — the API regression is caught, not silently reintroduced.
 */
import { expectTypeOf } from 'vitest';
import { setup, type SnapshotFrom } from 'xstate';

import { Service } from './services';
import type { ComputedAccessor, ComputedFor, Field, LatestAsyncTask } from './services';

class Probe extends Service {
  readonly count = this.atom(0, 'count');
  readonly cursor = this.field<string | null>(null, 'cursor');

  /** Open the protected primitive for its public type-level checks. */
  readonly openLatestAsyncTask = () => this.latestAsyncTask();

  /** Plain derivation: zero-arg callback, zero-arg read. */
  readonly doubled = this.computed(() => this.count.get() * 2);

  // @ts-expect-error — computed(fn) is a plain derivation; the parameterized
  // form was removed in 011 Part 4.1 (use computedFor). If this stops
  // erroring, the hidden-LRU API has crept back.
  readonly bad = this.computed((n: number) => n * 2); // eslint-disable-line wheel/no-optional-computed-args -- deliberate bad sample: this line exists to BE the error the tripwire pins

  /** Keyed derivation: one live memo per key, same call syntax as a function. */
  readonly plus = this.computedFor((n: number) => this.count.get() + n);
}

declare const probe: Probe;

expectTypeOf(probe.doubled).toMatchTypeOf<ComputedAccessor<number>>();
expectTypeOf(probe.doubled()).toEqualTypeOf<number>();
expectTypeOf(probe.cursor).toMatchTypeOf<Field<string | null>>();
expectTypeOf(probe.cursor.get()).toEqualTypeOf<string | null>();

// A plain computed's read takes no arguments either.
// @ts-expect-error — zero-arg read
probe.doubled(1);

expectTypeOf(probe.plus).toMatchTypeOf<ComputedFor<[number], number>>();
expectTypeOf(probe.plus(2)).toEqualTypeOf<number>();

expectTypeOf(probe.openLatestAsyncTask()).toMatchTypeOf<LatestAsyncTask>();
expectTypeOf(probe.openLatestAsyncTask().signal).toMatchTypeOf<AbortSignal>();
expectTypeOf(probe.openLatestAsyncTask().wait(Promise.resolve(1))).toMatchTypeOf<Promise<number>>();

// A keyed derivation cannot be read without its key.
// @ts-expect-error — the key is required
probe.plus();

type ModeEvent =
  | { readonly type: 'start'; readonly target: number }
  | { readonly type: 'cancel' };

const modeMachine = setup({
  types: {
    context: {} as { readonly target: number | null },
    events: {} as ModeEvent
  }
}).createMachine({
  context: { target: null },
  initial: 'idle',
  states: {
    idle: { on: { start: 'active' } },
    active: { on: { cancel: 'idle' } }
  }
});

class MachineProbe extends Service {
  readonly mode = this.machine(modeMachine, {
    transitions: {
      start: (target: number) => ({ type: 'start', target }),
      cancel: () => ({ type: 'cancel' })
    }
  });
}

declare const machineProbe: MachineProbe;

expectTypeOf(machineProbe.mode.state()).toEqualTypeOf<SnapshotFrom<typeof modeMachine>>();
expectTypeOf(machineProbe.mode.transitions.start).parameters.toEqualTypeOf<[target: number]>();
expectTypeOf(machineProbe.mode.transitions.cancel).parameters.toEqualTypeOf<[]>();

// @ts-expect-error — named transition actions preserve their event-builder arguments
machineProbe.mode.transitions.start('wrong');
// @ts-expect-error — only declared transition actions are public
machineProbe.mode.transitions.finish();

const inputMachine = setup({
  types: {
    context: {} as { readonly initial: number },
    events: {} as { readonly type: 'reset' },
    input: {} as { readonly initial: number }
  }
}).createMachine({
  context: ({ input }) => ({ initial: input.initial }),
  initial: 'ready',
  states: { ready: {} }
});

class InputMachineProbe extends Service {
  readonly valid = this.machine(inputMachine, {
    input: { initial: 1 },
    transitions: { reset: () => ({ type: 'reset' }) }
  });

  // @ts-expect-error — an XState machine with required input must receive it
  readonly missingInput = this.machine(inputMachine, {
    transitions: { reset: () => ({ type: 'reset' }) }
  });
}
