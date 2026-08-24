# Services

Human page: [Services](../docs/services.mdx). API: [`wheel/core`](api/core.md), [`wheel/sync`](api/sync.md).

## Construction

Each service class receives one `ServiceContext`. The context lazily constructs one instance per scope and rejects circular dependency chains.

Declare dependencies as fields before eager computeds that read them:

```ts
private readonly board = this.service(BoardService);
readonly count = this.computed(() => this.board.rows().length);
```

Class fields run before constructor statements. A constructor-assigned dependency is unavailable to eager field initializers.

## Context hierarchy

- Root `WheelProvider` creates a client-backed context.
- Root `ServiceProvider` can create a clientless context.
- Child `ServiceProvider` creates a scope with inheritance and overrides.
- `inheritServices: 'live'` shares synced services and recreates local services.
- Override ownership is `caller` or `context`; context-owned replacements clean up with the scope.

## Lifecycle

- `addCleanup(fn)` registers one disposal callback.
- Disposal aborts the active latest async task.
- Disposal stops service-owned state machines.
- Keyed state families clear their entries.
- Context-owned service overrides receive cleanup once.

## Determinism

- `now()` reads the injected epoch clock.
- `defer(ms, fn)` uses the injected one-shot scheduler.
- Client-backed service contexts reuse client clock and scheduling seams.
- Clientless contexts accept clock and scheduler options.

## Async flow choice

- Use `action` for synchronous writes.
- Use `latestAsyncTask` when later work supersedes earlier work.
- Use `machine` for named states and transition guards.
- Use `retryForever` for retryable work with teardown.

`LatestAsyncTask.wait(promise)` rejects with `AbortError` after replacement or disposal. Pass `task.signal` into fetch-like APIs.

## Public versus private state

- Public reactive data uses atoms, computeds, machines, and query views.
- Private handles and bookkeeping use fields.
- Components receive values and bound actions, not whole service instances.
- All shared writes occur inside service actions or mutation methods.

Primary sources:

- [`packages/wheel/src/core/services.ts`](../../packages/wheel/src/core/services.ts)
- [`packages/docs/examples/services`](../../packages/docs/examples/services)
