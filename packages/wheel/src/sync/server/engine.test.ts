// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mutation, query, rejection, table } from '../declarations';
import { createIdGen, fixedClock, seededRandomBytes, type IdGen } from '../ids';
import { t } from '../schema';
import { sql } from '../sql';
import { betterSqlite3Driver, type SqliteDriver } from './backends/sqlite-driver';
import { SyncServer, type RowDelta, type ServerEvent } from './engine';
import { createSyncServer } from './node-engine';
import { serveMutation, serveQuery } from './serve';

const TodoRow = t.object({
  id: t.string(),
  listId: t.string(),
  text: t.string(),
  done: t.boolean()
});
const todos = table({ name: 'todos', type: TodoRow, key: (row) => row.id });
const notes = table({ name: 'notes', type: t.object({ id: t.string(), body: t.string() }), key: (row) => row.id });

const todosByList = query({
  name: 'todos.byList', params: t.object({ listId: t.string() }), into: todos });
const notesAll = query({
  name: 'notes.all', params: t.object({}), into: notes });
const addTodo = mutation({
  name: 'todos.add', args: t.object({ listId: t.string(), text: t.string() }) });
const toggleTodo = mutation({
  name: 'todos.toggle', args: t.object({ todoId: t.string() }) });
const deleteTodo = mutation({
  name: 'todos.delete', args: t.object({ todoId: t.string() }) });
const addNote = mutation({
  name: 'notes.add', args: t.object({ body: t.string() }) });
const forbiddenMutation = mutation({
  name: 'todos.forbidden', args: t.object({}) });
const driftedQuery = query({
  name: 'todos.drifted', params: t.object({}), into: todos });
const duplicateTodos = query({
  name: 'todos.duplicates', params: t.object({}), into: todos });

const syncModule = {
  todos,
  notes,
  todosByList,
  notesAll,
  duplicateTodos,
  addTodo,
  toggleTodo,
  deleteTodo,
  addNote,
  forbiddenMutation,
  driftedQuery
};

const servers = {
  todosByListServer: serveQuery({
  query: todosByList,
    sql: (params) => sql`select id, list_id as "listId", text, done from todos where list_id = ${params.listId} order by id`,
    rerunOn: ['todos']
  }),
  notesAllServer: serveQuery({
  query: notesAll,
    sql: () => sql`select id, body from notes order by id`,
    rerunOn: ['notes']
  }),
  driftedServer: serveQuery({
  query: driftedQuery,
    // Deliberately forgets `as "listId"` — the boundary net must catch this.
    sql: () => sql`select id, list_id, text, done from todos order by id`,
    rerunOn: ['todos']
  }),
  duplicateTodosServer: serveQuery({
    query: duplicateTodos,
    sql: () => sql`
      select id, list_id as "listId", text, done from todos
      union all
      select id, list_id as "listId", text, done from todos`,
    rerunOn: ['todos']
  }),
  addTodoServer: serveMutation({
  mutation: addTodo,
  handler: async (tx, args, ctx) => {
    await tx.sql`insert into todos (id, list_id, text, done) values (${ctx.newId('todo')}, ${args.listId}, ${args.text}, false)`;
  }
}),
  toggleTodoServer: serveMutation({
  mutation: toggleTodo,
  handler: async (tx, args) => {
    await tx.sql`update todos set done = not done where id = ${args.todoId}`;
  }
}),
  deleteTodoServer: serveMutation({
  mutation: deleteTodo,
  handler: async (tx, args) => {
    await tx.sql`delete from todos where id = ${args.todoId}`;
  }
}),
  addNoteServer: serveMutation({
  mutation: addNote,
  handler: async (tx, args, ctx) => {
    await tx.sql`insert into notes (id, body) values (${ctx.newId('note')}, ${args.body})`;
  }
}),
  forbiddenServer: serveMutation({
  mutation: forbiddenMutation,
  handler: async (tx) => {
    await tx.sql`insert into todos (id, list_id, text, done) values ('todo_zzz', 'l_1', 'nope', false)`;
    throw rejection('forbidden', 'you shall not pass');
  }
})
};

let driver: SqliteDriver;
let db: { query(text: string, params?: readonly unknown[]): Promise<Record<string, unknown>[]> };
let server: SyncServer;
let ids: IdGen;
const principal = {
  actor: 'user:test',
  workspaceId: 'workspace:test',
  sessionId: 'session:test'
};

async function mutate(name: string, args: unknown, generated: string[] = []) {
  return server.mutate(
    {
      clientId: 'test_client',
      mutationId: ids.newId('m'),
      name,
      args,
      ids: generated
    },
    principal
  );
}

beforeEach(async () => {
  driver = betterSqlite3Driver(':memory:');
  db = {
    query: (text, params) => Promise.resolve(driver.all(text, params))
  };
  await db.query(`create table todos (id text primary key, list_id text not null, text text not null, done boolean not null)`);
  await db.query(`create table notes (id text primary key, body text not null)`);
  ids = createIdGen({ clock: fixedClock(1_700_000_000_000, 1), randomBytes: seededRandomBytes(7) });
  server = await createSyncServer({
    sqlite: { driver },
    syncModules: [syncModule],
    servers: [servers],
    clock: fixedClock(1_700_000_000_000, 1),
    randomBytes: seededRandomBytes(42)
  });
});

afterEach(async () => {
  await server.close();
});

function collectEvents(connection: ReturnType<SyncServer['connect']>): ServerEvent[] {
  const events: ServerEvent[] = [];
  connection.onEvent((event) => events.push(event));
  return events;
}

function connect(clientId = 'web_1') {
  return server.connect(clientId, principal);
}

describe('subscribe + snapshot', () => {
  test('snapshot returns validated rows and the current seq', async () => {
    await mutate('todos.add', { listId: 'l_1', text: 'first' }, [ids.newId('todo')]);
    const connection = connect();
    const snapshot = await connection.subscribe('todos.byList', { listId: 'l_1' });
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]).toMatchObject({ listId: 'l_1', text: 'first', done: false });
    expect(snapshot.seq).toBe(server.seq());
  });

  test('unknown query and invalid params fail loudly', async () => {
    const connection = connect();
    await expect(connection.subscribe('nope.nope', {})).rejects.toThrow(/No query named/);
    await expect(connection.subscribe('todos.byList', { wrong: true })).rejects.toThrow(/invalid/i);
  });

  test('a hibernated connection restores subscription ids, baselines, and presence', async () => {
    const original = connect();
    const snapshot = await original.subscribe('todos.byList', { listId: 'l_1' });
    server.setPresence(original.clientId, { cursor: 'todo-list' });
    const state = original.state();
    original.close();

    const restored = await server.restoreConnection(state);
    const events = collectEvents(restored);
    expect(restored.state()).toEqual(state);

    await mutate('todos.add', { listId: 'l_1', text: 'after wake' }, [ids.newId('todo')]);

    const delta = events.find((event) => event.type === 'delta');
    expect(delta).toMatchObject({
      type: 'delta',
      delta: {
        subscriptionId: snapshot.subscriptionId,
        puts: [expect.objectContaining({ text: 'after wake' })]
      }
    });
  });
});

describe('mutation → sync log → delta', () => {
  test('a committed mutation re-runs watching subscriptions and emits whole-row puts', async () => {
    const connection = connect();
    const events = collectEvents(connection);
    await connection.subscribe('todos.byList', { listId: 'l_1' });

    const result = await mutate('todos.add', { listId: 'l_1', text: 'hello' }, [ids.newId('todo')]);
    expect(result.ok).toBe(true);

    const deltas = events.filter((event) => event.type === 'delta');
    expect(deltas).toHaveLength(1);
    const delta = (deltas[0] as { delta: RowDelta }).delta;
    expect(delta.puts).toHaveLength(1);
    expect(delta.puts[0]).toMatchObject({ text: 'hello', done: false });
    expect(delta.seq).toBe(server.seq());
  });

  test('externalWrite ingests engine-external writes: sync_log row, seq advance, deltas', async () => {
    const connection = connect();
    const events = collectEvents(connection);
    await connection.subscribe('todos.byList', { listId: 'l_1' });

    // A write the engine never saw — the coexistence path for legacy stores.
    await db.query(`insert into todos (id, list_id, text, done) values ('todo_ext', 'l_1', 'from outside', false)`);
    const seq = await server.externalWrite({ tables: ['todos'], source: 'legacy:test' });

    expect(seq).toBe(server.seq());
    const deltas = events.filter((event) => event.type === 'delta');
    expect(deltas).toHaveLength(1);
    const delta = (deltas[0] as { delta: RowDelta }).delta;
    expect(delta.puts).toHaveLength(1);
    expect(delta.puts[0]).toMatchObject({ id: 'todo_ext', text: 'from outside' });

    const [logRow] = await db.query(`select mutation_name, touched from wheel_sync_log where seq = ${seq}`);
    expect(logRow).toMatchObject({ mutation_name: 'legacy:test' });

    // Unwatched tables re-run nothing; empty input is a no-op that keeps seq.
    const before = server.seq();
    await server.externalWrite({ tables: ['notes'] });
    expect(events.filter((event) => event.type === 'delta')).toHaveLength(1);
    expect(await server.externalWrite({ tables: [] })).toBe(server.seq());
    expect(server.seq()).toBeGreaterThanOrEqual(before);
  });

  test('watch is honored: writes to other tables do not re-run the query', async () => {
    const connection = connect();
    const events = collectEvents(connection);
    await connection.subscribe('todos.byList', { listId: 'l_1' });

    await mutate('notes.add', { body: 'unrelated' }, [ids.newId('note')]);
    expect(events.filter((event) => event.type === 'delta')).toHaveLength(0);
  });

  test('the sync log records touched tables automatically', async () => {
    await mutate('todos.add', { listId: 'l_1', text: 'x' }, [ids.newId('todo')]);
    await mutate('notes.add', { body: 'y' }, [ids.newId('note')]);
    const log = await db.query('select mutation_name, touched from wheel_sync_log order by seq');
    expect(JSON.parse(String(log[0].touched))).toEqual(['todos']);
    expect(JSON.parse(String(log[1].touched))).toEqual(['notes']);
  });

  test('deletes arrive as id deletes', async () => {
    const generated = [ids.newId('todo')];
    await mutate('todos.add', { listId: 'l_1', text: 'doomed' }, generated);
    const connection = connect();
    const events = collectEvents(connection);
    const snapshot = await connection.subscribe('todos.byList', { listId: 'l_1' });
    const todoId = snapshot.rows[0].id as string;

    await mutate('todos.delete', { todoId });
    const delta = (events.find((event) => event.type === 'delta') as { delta: RowDelta }).delta;
    expect(delta.deletes).toEqual([todoId]);
    expect(delta.puts).toEqual([]);
  });

  test('an unchanged re-run emits nothing', async () => {
    await mutate('todos.add', { listId: 'l_1', text: 'stay' }, [ids.newId('todo')]);
    const connection = connect();
    const events = collectEvents(connection);
    await connection.subscribe('todos.byList', { listId: 'l_1' });

    // Touches todos but changes nothing visible to l_1.
    await mutate('todos.add', { listId: 'l_OTHER', text: 'elsewhere' }, [ids.newId('todo')]);
    expect(events.filter((event) => event.type === 'delta')).toHaveLength(0);
  });

  test('seq is strictly monotonic across mutations', async () => {
    const seqs: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const result = await mutate('todos.add', { listId: 'l_1', text: `todo ${index}` }, [ids.newId('todo')]);
      if (result.ok) seqs.push(result.seq);
    }
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
    expect(server.seq()).toBe(5);
  });
});

describe('rejection and rollback (typed values, not wire exceptions)', () => {
  test('rejection() rolls back the whole transaction and returns the rejection', async () => {
    const result = await mutate('todos.forbidden', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection).toEqual({ kind: 'rejection', code: 'forbidden', message: 'you shall not pass' });
    }
    // The insert before the rejection must be gone, and no sync_log row exists.
    expect(await db.query(`select * from todos where id = 'todo_zzz'`)).toHaveLength(0);
    expect(await db.query('select * from wheel_sync_log')).toHaveLength(0);
    expect(server.seq()).toBe(0);
  });
});

describe('id replay', () => {
  test('the server consumes the client id stream in order', async () => {
    const generated = [ids.newId('todo')];
    await mutate('todos.add', { listId: 'l_1', text: 'x' }, generated);
    const rows = await db.query('select id from todos');
    expect(rows[0].id).toBe(generated[0]);
  });

  // These are VERDICTS about a broken mutation, not throws — a throw
  // would make clients park-and-retry a mutation that breaks identically
  // forever. Loud now means a typed, terminal error result.
  function expectError(result: Awaited<ReturnType<typeof server.mutate>>, code: string, pattern: RegExp): void {
    if (result.ok || !('error' in result)) {
      throw new Error(`expected an error verdict, got ${JSON.stringify(result)}`);
    }
    expect(result.error.code).toBe(code);
    expect(result.error.message).toMatch(pattern);
  }

  test('asking for more ids than provided fails loudly', async () => {
    expectError(
      await mutate('todos.add', { listId: 'l_1', text: 'x' }, []),
      'id_stream_exhausted',
      /more ids than the client pre-generated/
    );
  });

  test('prefix mismatch fails loudly', async () => {
    expectError(
      await mutate('todos.add', { listId: 'l_1', text: 'x' }, [ids.newId('note')]),
      'id_stream_mismatch',
      /prefix/
    );
  });

  test('malformed mutation ids and row ids are refused', async () => {
    expectError(
      await server.mutate(
        { clientId: 'c', mutationId: 'not-an-id', name: 'todos.add', args: {}, ids: [] },
        principal
      ),
      'invalid_mutation_id',
      /not a valid m_/
    );
    expectError(await mutate('todos.add', { listId: 'l', text: 'x' }, ['garbage']), 'invalid_id', /not a valid prefixed/);
  });
});

describe('the boundary net', () => {
  test('snake_case drift in server SQL fails loudly, naming query and column', async () => {
    await mutate('todos.add', { listId: 'l_1', text: 'x' }, [ids.newId('todo')]);
    const connection = connect();
    await expect(connection.subscribe('todos.drifted', {})).rejects.toThrow(/todos\.drifted.*listId/s);
  });

  test('duplicate result keys fail loudly with query, table, key, and row indexes', async () => {
    await mutate('todos.add', { listId: 'l_1', text: 'duplicate me' }, [ids.newId('todo')]);
    const connection = connect();

    await expect(connection.subscribe('todos.duplicates', {})).rejects.toThrow(
      /Query "todos\.duplicates" returned duplicate key .* table "todos" at rows 0 and 1/
    );
  });
});

describe('connection lifecycle', () => {
  test('closing a connection drops its subscriptions', async () => {
    const connection = connect();
    await connection.subscribe('todos.byList', { listId: 'l_1' });
    expect(server.debugSubscriptions()).toHaveLength(1);
    connection.close();
    expect(server.debugSubscriptions()).toHaveLength(0);
  });

  test('duplicate client ids are refused', () => {
    connect();
    expect(() => connect()).toThrow(/already has a live connection/);
  });
});

describe('debug surface', () => {
  test('debugSubscriptions reports live subscription state', async () => {
    const connection = connect();
    await connection.subscribe('todos.byList', { listId: 'l_1' });
    await mutate('todos.add', { listId: 'l_1', text: 'x' }, [ids.newId('todo')]);
    const [info] = server.debugSubscriptions();
    expect(info).toMatchObject({ clientId: 'web_1', query: 'todos.byList', rows: 1, rerunOn: ['todos'] });
    expect(info.runs).toBeGreaterThanOrEqual(2); // snapshot + rerun
    expect(info.lastSeq).toBe(server.seq());
  });
});
