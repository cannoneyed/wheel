# Set up wheel

You are an agent adding **wheel** to a project. Follow this file top to bottom.
Wheel is a framework for local-first apps where every document runs on its own
server. It is opinionated on purpose: the conventions below are enforced by lint
rules, and `bun run lint` is the specification.

Full documentation: https://wheel.dev/docs/

---

## 1. Install

```sh
bun add wheel@npm:@cannoneyed/wheel@0.1.0 solid-js
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
    proxy: { '/sync': { target: 'http://localhost:4795', ws: true } }
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
  readonly list = this.liveQuery(todoList, {});
  readonly remaining = this.computed(() => this.list.rows.filter((r) => !r.done).length);

  readonly add = (text: string) => this.mutate(addTodo, { text });
  readonly toggle = (todoId: string) => this.mutate(toggleTodo, { todoId });
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
cannot drift. Declare tables, queries, and mutations there; bind the server
handlers in a `.server.ts` beside it.

The server is the only truth. Clients write optimistically and every guess is
either confirmed or cleanly rolled back. `mutate()` never throws — four typed
outcomes arrive on one settled channel, so there is no try/catch to write.

`localCache` is a required client option. There is no non-local-first mode.

### Create the browser client

Use a stable IndexedDB scope and a fresh wire id. A reload should reuse local
rows and the outbox. Two live pages must never share one wire id.

```ts
// src/sync/client.ts
import {
  IndexedDbCache,
  SyncClient,
  createWebSocketTransport,
  systemClock,
  systemRandomBytes
} from 'wheel/sync';

const APPLICATION_VERSION = 1;
const scopeKey = 'todos.storeScope';
let storeScope = localStorage.getItem(scopeKey);
if (!storeScope) {
  storeScope = crypto.randomUUID();
  localStorage.setItem(scopeKey, storeScope);
}

const wireId = `web_${crypto.randomUUID().slice(0, 8)}`;

export let client: SyncClient;
const transport = createWebSocketTransport({
  baseUrl: '',
  applicationVersion: APPLICATION_VERSION,
  params: { demoActor: `user:${wireId}`, demoSession: wireId },
  onReconnect: () => void client.rebootstrap(),
  onStatus: (status) => client.setConnectionStatus(status),
  onVersionMismatch: ({ reason }) => {
    if (reason === 'server_updating') return;
    // wheel-raw-location: incompatible client assets require a full reload.
    location.reload();
  }
});

client = new SyncClient({
  transport,
  clientId: wireId,
  actor: `user:${wireId}`,
  clock: systemClock,
  randomBytes: systemRandomBytes,
  localCache: new IndexedDbCache('todos', {
    snapshots: `${storeScope}|snapshots:v${APPLICATION_VERSION}`,
    outbox: `${storeScope}|outbox`,
    retires: (scope) =>
      scope.startsWith(`${storeScope}|`) &&
      scope !== `${storeScope}|snapshots:v${APPLICATION_VERSION}` &&
      scope !== `${storeScope}|outbox`
  })
});
```

The query values above are demo identity only. A production browser uses a
same-origin session cookie or a short-lived WebSocket ticket. The server owns
the actor and workspace after it verifies the upgrade.

### Create the local Bun server

The server accepts only `/sync/websocket`. It authenticates before the upgrade,
then passes every frame to `SyncSocketServer`.

```ts
// server.ts
import type { ServerWebSocket } from 'bun';
import { defineAuthenticator } from 'wheel/auth';
import {
  SyncSocketServer,
  authenticateSyncSocket,
  bunSqliteDriver,
  createSyncServer,
  type SyncServerSocket,
  type SyncSocketHandshake
} from 'wheel/sync/server';
import * as todosServer from './src/sync/todos.server';
import * as todosSync from './src/sync/todos.sync';
import { TODOS_SCHEMA } from './src/sync/todos.server';

const driver = bunSqliteDriver('./todos.db');
for (const statement of TODOS_SCHEMA) driver.all(statement);

const syncServer = await createSyncServer({
  sqlite: { driver },
  syncModules: [todosSync],
  servers: [todosServer]
});

const authenticator = defineAuthenticator((request) => {
  const url = new URL(request.url);
  const actor = url.searchParams.get('demoActor');
  const sessionId = url.searchParams.get('demoSession');
  return actor && sessionId
    ? { actor, sessionId, workspaceId: 'todos' }
    : null;
});

const sockets = new SyncSocketServer({
  server: syncServer,
  applicationVersion: 1,
  schemaVersion: 1
});

interface SocketData {
  readonly handshake: SyncSocketHandshake;
  attachment: unknown;
}

function adapt(socket: ServerWebSocket<SocketData>): SyncServerSocket {
  return {
    send: (message) => socket.send(message),
    close: (code, reason) => socket.close(code, reason),
    getAttachment: () => socket.data.attachment,
    setAttachment: (value) => { socket.data.attachment = value; }
  };
}

const httpServer = Bun.serve<SocketData>({
  port: 4795,
  async fetch(request, server) {
    if (new URL(request.url).pathname !== '/sync/websocket') {
      return new Response('Not found.', { status: 404 });
    }
    const authenticated = await authenticateSyncSocket(request, {
      authenticator,
      workspaceId: 'todos'
    });
    if (!authenticated.ok) return authenticated.response;
    const upgraded = server.upgrade(request, {
      data: { handshake: authenticated.handshake, attachment: null }
    });
    return upgraded ? undefined : new Response('Upgrade failed.', { status: 500 });
  },
  websocket: {
    open(socket) { sockets.accept(adapt(socket), socket.data.handshake); },
    message(socket, message) { void sockets.message(adapt(socket), message); },
    close(socket) { sockets.close(adapt(socket)); }
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    sockets.closeAll(1001, 'server_shutdown');
    void httpServer.stop(true).then(() => syncServer.close());
  });
}
```

Run `bun run server.ts`, then run Vite. The browser proxy forwards the WebSocket
upgrade because it sets `ws: true`.

For production, keep the client and declarations. Replace the Bun entry point
with a Cloudflare Worker that routes trusted workspaces to Durable Objects. Each
object applies `applyDurableObjectMigrations()`, creates
`createCloudflareSyncBackend()`, and restores hibernated sockets before it
handles messages. See the Cloudflare guide below.

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
