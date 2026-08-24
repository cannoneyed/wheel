/**
 * The stubbing tiers for sandboxes, tests, and playgrounds:
 *
 * Tier 1 — stub the shape. `StubProvider` maps connection functions to
 *   hand-built shapes. A fully stubbed component needs no services, no client,
 *   no providers underneath — pure view sandbox.
 * Tier 2 — fake the services. `ServiceProvider overrides` + `fakeService`
 *   swap real services for partial fakes; every self-connecting descendant
 *   resolves the same fakes. Deep trees, zero prop plumbing.
 * Tier 3 — run the real engine. A World-backed `WheelProvider` (see
 *   wheel/testing) with seeded data — full integration, deterministic.
 */
import { useContext, type JSX } from 'solid-js';

import { StubContext } from './context';
import type { Service, ServiceClass } from './services';

/** One stub entry: [what to stub, the shape to hand out]. Build with stubOf(). */
export type StubEntry = readonly [object, unknown];

/**
 * Typed stub pairing: the compiler holds the shape to exactly what the
 * component declared it needs.
 *
 *   <StubProvider stubs={[stubOf(connectTodoList, { rows: FAKE, status: LIVE, add: noop })]}>
 *     <TodoList listId="a" />
 *   </StubProvider>
 */
export function stubOf<Props, Shape>(
  target: (props: Props) => Shape,
  shape: Shape
): StubEntry {
  return [target, shape] as const;
}

/** Provides stub shapes to the subtree. Nests: inner stubs win. */
export function StubProvider(props: { stubs: readonly StubEntry[]; children: JSX.Element }): JSX.Element {
  const parent = useContext(StubContext);
  const map = new Map<object, unknown>(parent ?? []);
  for (const [target, shape] of props.stubs) {
    map.set(target, shape);
  }
  return <StubContext.Provider value={map}>{props.children}</StubContext.Provider>;
}

/**
 * Build a partial service fake for `ServiceProvider overrides` without class
 * ceremony. Only the members the subtree actually touches need to exist —
 * anything else missing throws loudly on access in the test, which is what
 * you want from a fake.
 *
 *   const fake = fakeService(TodoService, { rows: () => FAKE_ROWS, remaining: () => 2 });
 *   <ServiceProvider
 *     overrides={[{ original: TodoService, replacement: fake, ownership: 'caller' }]}
 *   >
 */
export function fakeService<S extends Service>(
  _ServiceType: ServiceClass<S>,
  fake: Partial<S>
): S {
  return fake as S;
}
