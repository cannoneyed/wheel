# Set up wheel

You are an agent adding **wheel** to a project. Follow this file top to bottom.
Wheel is a framework for local-first apps where every document runs on its own
server. It is opinionated on purpose: the conventions below are enforced by lint
rules, and `bun run lint` is the specification.

Full documentation: https://wheel.dev/docs/

---

## 1. Install

```sh
bun add wheel@npm:@cannoneyed/wheel@0.2.0 solid-js
```

`wheel` is the local npm alias for `@cannoneyed/wheel`. Keep all imports under
`wheel/...`.

## 2. Configure Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { wheelDevTools } from 'wheel/vite';

export default defineConfig({
  resolve: { dedupe: ['solid-js'] },
  plugins: [solid(), wheelDevTools()],
  server: {
    proxy: { '/sync': { target: 'http://localhost:4795' } }
  }
});
```

Both entries are required:

- `resolve.dedupe` makes the app and wheel share ONE `solid-js` runtime. With
  two, wheel throws during provider startup because the active Solid owner comes
  from the other copy.
- `wheelDevTools()` enables the debug panel and the `window.__wheel` agent bridge
  during `vite serve`, keeps them out of `vite build`, and preserves service
  class names (service identity IS the class name — minified, the debug panel
  goes illegible).

## 3. The three files every feature needs

### A service owns the state

A service is a singleton class that owns shared state. `Service` (`wheel/core`)
holds local state; `SyncService` (`wheel/sync`) adds server-synced state.

```ts
// src/services/todo-service.ts
import { SyncService } from 'wheel/sync';
import { addTodo, todoList, toggleTodo } from '../sync/todos.sync';

export class TodoService extends SyncService {
  readonly list = this.liveQuery(todoList, () => ({}));
  readonly remaining = this.computed(() => this.list.rows.filter((r) => !r.done).length);

  readonly add = this.action('add', (text: string) => this.mutate(addTodo, { text }));
  readonly toggle = this.action('toggle', (id: string) => this.mutate(toggleTodo, { id }));
}
```

Rules that apply here:

- Derive with `computed`, never copy into a field. Copies go stale.
- Mutable private state uses `this.field(initial)`, not a bare property — a bare
  one hides its value and its write history from the debug panel.
- A field initializer must not read a field declared below it. Class fields run
  before the constructor body, so the later one is still `undefined`.
- Business state takes injected clocks, scheduling, randomness, and ids. Native
  timers are presentation-only and carry a `wheel-view-timing:` reason.

### A connected component reads it

`connect(name, builder)` is the ONLY way a component reads a service. The builder
returns a `view()` of named reads and named actions. The component receives that
view, never the service object.

```tsx
// src/components/todo-list.tsx
import { For } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';
import { TodoService } from '../services/todo-service';

const connectTodoList = connect('TodoList', (c) => {
  const todos = c.service(TodoService);
  return view({ rows: () => todos.list.rows, remaining: todos.remaining }, { add: todos.add });
});

export function TodoList() {
  const state = connectTodoList({});
  const [draft, setDraft] = useSignal('', 'draft');
  return (
    <ul use:componentRoot>
      <For each={state.rows}>{(row) => <li>{row.text}</li>}</For>
    </ul>
  );
}
```

Rules that apply here:

- One `connect()` per component, named `connect<Name>`, called first.
- Services are reached through `connect()` only. No context reads, no hooks.
- `use:componentRoot` marks a connected component's root element;
  `use:viewRoot={'Name'}` marks a non-connected one. Without them the component
  is invisible to the inspector and the agent bridge.
- Component-local state uses `useSignal(initial, 'name')`, not `createSignal`.
- `use:` is a Solid COMPILER feature and only binds to native elements. On a
  component it compiles to nothing — silently. Keep the native element, or wrap
  the component in one.

### A root mounts the app

```tsx
// src/main.tsx
import { render } from 'solid-js/web';
import { WheelApp } from 'wheel/debug';
import { TodoList } from './components/todo-list';
import { client } from './sync/client';

render(
  () => (
    <WheelApp client={client}>
      <TodoList />
    </WheelApp>
  ),
  document.getElementById('root')!
);
```

Omit `client` for an app with no sync — `WheelApp` then hosts a clientless
service tree and `Service` classes work unchanged.

## 4. Sync, if the app has a server

A sync module is imported by BOTH the client and the server, so the wire types
cannot drift. Declare collections, queries, and mutations there; bind the server
handlers in a `.server.ts` beside it.

The server is the only truth. Clients write optimistically and every guess is
either confirmed or cleanly rolled back. `mutate()` never throws — four typed
outcomes arrive on one settled channel, so there is no try/catch to write.

`localCache` is a required client option. There is no non-local-first mode.

## 5. Verify

Run these before reporting the work done. Zero errors is the only passing state;
never weaken a rule to make it pass.

```sh
bun run lint        # the convention linter
bun run typecheck
bun run test
```

If a lint rule fires, read its message — each one names the fix. Escapes are
in-file pragmas with a written reason (`// wheel-raw-location: <why>`), never
glob carve-outs in the config.

## 6. Where to read more

| Topic | Page |
| --- | --- |
| The three files, in full | https://wheel.dev/docs/#/getting-started |
| Services, fields, computeds, actions | https://wheel.dev/docs/#/services |
| `connect`, `view`, local state | https://wheel.dev/docs/#/components |
| Declaring synced data end to end | https://wheel.dev/docs/#/walkthrough |
| Every lint rule and why it exists | https://wheel.dev/docs/#/linting |
| Debug panel and the agent bridge | https://wheel.dev/docs/#/debugging |
| Deploying on Durable Objects | https://wheel.dev/docs/#/cloudflare |
