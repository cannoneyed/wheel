# Testing

Human page: [Testing](../docs/testing.mdx). API: [`wheel/testing`](api/testing.md), [`wheel/testing/playwright`](api/testing-playwright.md).

## Choose a surface

| Scope | Tool |
| --- | --- |
| One connected component | `stubOf` and `StubProvider` |
| Service subtree | `ServiceProvider` overrides |
| Sync convergence and replay | `World` |
| Seeded adversarial operations | `simulate` and `replayFixture` |
| Running browser state and actions | `wheelDriver` |
| Browser gestures and external SDKs | `createBehaviorHarness` |

## World

`World.create()` boots the real engine, fixed clocks, seeded ids, memory local caches, and a pausable in-process network.

`WorldOptions` requires `syncModules` and `servers`. `setup(db)` runs before engine boot on the same database. The backend is better-sqlite3 `:memory:`.

Important methods:

- `client(id, { actor? })`: create or return one deterministic client.
- `twoClients(a, b)`: convergence setup.
- `network.pause(id)` and `network.resume(id)`: scripted offline boundary.
- `rejectNext(name, code, message?)`: next authoritative business refusal.
- `settle()`: drain unpaused subscribes, network work, and server writer work.
- `close()`: close clients, server, and database resources.

Paused clients do not block `settle()`.

## Contract helpers

- `expectMutationParity()` compares immediate optimistic membership and order with settled server truth.
- `expectQueryInvalidation()` asks SQLite which tables SQL reads and compares them with `rerunOn`.

## Simulation

`simulate()` runs a seeded weighted operation list across clients. At quiescence it checks convergence, sequence continuity, complete provenance causes, and absence of orphaned optimistic state.

Persist a failing seed and operations as `ReplayFixture`. `replayFixture()` verifies the final rows remain identical.

## Driver

`wheelDriver(page)` calls the development bridge. It reads state, finds components, invokes actions, waits for sync, and throws on captured app errors.

## Behavior harness

`createBehaviorHarness()` binds structural Playwright types. It supports named hosts, setup hooks, instrumented gestures, Wheel driver access, and action timelines.

Repository demo behaviors run against standalone HTTP sync and embedded in-browser sync. Every active behavior spec id maps to one test and recording.

## Deterministic utilities

`fixedClock`, `seededRandomBytes`, `createIdGen`, and `manualScheduler` remove wall-clock and random schedule drift.

Primary sources:

- [`world.ts`](../../packages/wheel/src/testing/world.ts)
- [`simulate.ts`](../../packages/wheel/src/testing/simulate.ts)
- [`parity.ts`](../../packages/wheel/src/testing/parity.ts)
- [`playwright.ts`](../../packages/wheel/src/testing/playwright.ts)
