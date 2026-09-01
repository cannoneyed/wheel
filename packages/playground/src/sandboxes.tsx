/**
 * The sandbox registry. To add a sandbox: write a mount function, push an
 * entry onto SANDBOXES. The three TodoList entries below are the reference
 * implementations of the stubbing tiers (see wheel/src/solid/stubs.tsx).
 */
// wheel-view-root: sandbox harness wrappers — the mounted TodoList is the
// surface under test; the wrappers themselves are not app surface
// wheel-raw-signal: the signal below backs a FAKE SERVICE, not component-local
// view state — it is the sandbox's stand-in store, and naming it for the debug
// tree would put harness plumbing beside the component under test
import { Match, Switch, createResource, createSignal, onCleanup, type JSX } from 'solid-js';
import { ServiceProvider, StubProvider, WheelProvider, fakeService, stubOf } from 'wheel/core';
import { type QueryStatus } from 'wheel/sync';
import { WheelDebugPanel } from 'wheel/debug';
import { World } from 'wheel/testing';

import { TodoList, connectTodoList } from './sample/todo-list';
import { TodoService } from './sample/todo-service';
import { todoSyncModule, type Todo } from './sample/todos.sync';
import { todoServers } from './sample/todos.server';
import { ComponentCatalog } from './component-catalog';
import { createWasmSqliteDriver } from './wasm-sqlite-driver';

export interface Sandbox {
  id: string;
  title: string;
  /** What this entry demonstrates, one sentence. */
  note: string;
  mount: () => JSX.Element;
}

const LIVE: QueryStatus = { kind: 'live' };

const FIXTURE: readonly Todo[] = [
  { id: 'todo_fixture_1', title: 'Sketch the layout', done: true, position: 0 },
  { id: 'todo_fixture_2', title: 'Wire the checkbox', done: false, position: 1 },
  { id: 'todo_fixture_3', title: 'Ship it', done: false, position: 2 }
];

/**
 * Tier 1 — stub the shape. The connection function is mapped straight to a
 * hand-built shape: no services, no client, no providers underneath. Actions
 * log to the console; the view is intentionally inert.
 */
function StubbedTodoList(): JSX.Element {
  return (
    <StubProvider
      stubs={[
        stubOf(connectTodoList, {
          rows: FIXTURE,
          status: LIVE,
          remaining: 2,
          // wheel-console: stub spies — the sandbox demonstrates actions by printing them
          add: (title: string) => console.log('[stub] add', title),
          // wheel-console: stub spies — the sandbox demonstrates actions by printing them
          toggle: (todoId: string) => console.log('[stub] toggle', todoId)
        })
      ]}
    >
      <TodoList />
    </StubProvider>
  );
}

/**
 * Tier 2 — fake the services. A partial TodoService fake backed by a local
 * signal, injected via ServiceProvider overrides. The component runs its real
 * connection; adds and toggles work, against fake state.
 */
function FakedTodoList(): JSX.Element {
  const [rows, setRows] = createSignal<readonly Todo[]>(FIXTURE);
  const fake = fakeService(TodoService, {
    list: {
      get rows() {
        return rows();
      },
      get status() {
        return LIVE;
      }
    } as unknown as TodoService['list'],
    remaining: (() => rows().filter((row) => !row.done).length) as TodoService['remaining'],
    add: ((title: string) =>
      setRows((prev) => [
        ...prev,
        { id: `todo_fake_${prev.length}`, title, done: false, position: prev.length }
      ])) as TodoService['add'],
    toggle: ((todoId: string) =>
      setRows((prev) =>
        prev.map((row) => (row.id === todoId ? { ...row, done: !row.done } : row))
      )) as TodoService['toggle']
  });
  return (
    <ServiceProvider
      scopeId="playground-fakes"
      overrides={[{ original: TodoService, replacement: fake, ownership: 'caller' }]}
    >
      <TodoList />
    </ServiceProvider>
  );
}

/**
 * Tier 3 — run the real engine. World boots SQLite WASM in the
 * browser, binds the sample sync module + server handlers, seeds three rows,
 * and hands a real SyncClient to WheelProvider. Every add/toggle runs the
 * full optimistic-apply → server-confirm loop in-process.
 */
function WorldTodoList(): JSX.Element {
  let world: World | undefined;
  const [client] = createResource(async () => {
    world = await World.create({
      driver: await createWasmSqliteDriver(),
      syncModules: [todoSyncModule],
      servers: [todoServers],
      setup: async (db) => {
        await db.query(`create table todos (
          id text primary key, title text not null,
          done boolean not null, position double precision not null)`);
        await db.query(`insert into todos values
          ('todo_seed_1', 'Boot a real server in the browser', true, 0),
          ('todo_seed_2', 'Subscribe over the in-process pipe', false, 1),
          ('todo_seed_3', 'Mutate through the whole engine', false, 2)`);
      }
    });
    return world.client('playground');
  });
  onCleanup(() => void world?.close());
  return (
    <Switch fallback={<div class="panel">Booting World (SQLite WASM)…</div>}>
      <Match when={client.state === 'errored'}>
        <div class="panel error">
          <strong>World failed to boot in this browser.</strong>
          <p>
            Tier 3 runs the real server engine on SQLite WASM in-process. The boot
            threw: <code>{String(client.error)}</code>
          </p>
          <p>Tiers 1 and 2 do not need the engine and keep working.</p>
        </div>
      </Match>
      <Match when={client.state === 'ready'}>
        <WheelProvider client={client()!}>
          <TodoList />
          <WheelDebugPanel />
        </WheelProvider>
      </Match>
    </Switch>
  );
}

export const SANDBOXES: Sandbox[] = [
  {
    id: 'component-catalog',
    title: 'Wheel component catalog',
    note: 'Every published component page with the default Mira theme in light and dark modes.',
    mount: () => <ComponentCatalog />
  },
  {
    id: 'todo-list-stubbed',
    title: 'TodoList — stubbed shape',
    note: 'Tier 1: stubOf(connectTodoList, fixture) — pure view, zero providers. Actions log to the console.',
    mount: () => <StubbedTodoList />
  },
  {
    id: 'todo-list-fakes',
    title: 'TodoList — fake services',
    note: 'Tier 2: ServiceProvider overrides with a signal-backed TodoService fake. Interactive, no engine.',
    mount: () => <FakedTodoList />
  },
  {
    id: 'todo-list-world',
    title: 'TodoList — live World engine',
    note: 'Tier 3: real server + client on SQLite WASM, seeded with 3 rows. Full sync loop.',
    mount: () => <WorldTodoList />
  }
];
