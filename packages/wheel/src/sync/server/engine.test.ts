// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mutation, query, rejection, collection } from '../declarations';
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
const todos = collection({ name: 'todos', type: TodoRow, key: (row) => row.id });
const notes = collection({ name: 'notes', type: t.object({ id: t.string(), body: t.string() }), key: (row) => row.id });

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
const brokenTodos = query({
  name: 'todos.broken', params: t.object({}), into: todos });
const flakyTodos = query({
  name: 'todos.flaky', params: t.object({ listId: t.string() }), into: todos });
let addHandlerRuns = 0;
let flakyQueryFails = false;
let flakySubscribeFails = false;

const syncModule = {
  todos,
  notes,
  todosByList,
  notesAll,
  duplicateTodos,
  brokenTodos,
  flakyTodos,
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
    sql: (params) => sql`select id, list_id as "listId", text, done from todos where list_id = ${params.listId} order by sort_rank, id`
  }),
  notesAllServer: serveQuery({
  query: notesAll,
    sql: () => sql`select id, body from notes order by id`
  }),
  driftedServer: serveQuery({
  query: driftedQuery,
    // Deliberately forgets `as "listId"` — the boundary net must catch this.
    sql: () => sql`select id, list_id, text, done from todos order by id`
  }),
  duplicateTodosServer: serveQuery({
    query: duplicateTodos,
    sql: () => sql`
      select id, list_id as "listId", text, done from todos
      union all
      select id, list_id as "listId", text, done from todos`
  }),
  brokenTodosServer: serveQuery({
    query: brokenTodos,
    sql: () => sql`select id, list_id as "listId", text, done from missing_todos`
  }),
  flakyTodosServer: serveQuery({
    query: flakyTodos,
    handler: {
      kind: 'test-flaky',
      async run(params, ctx) {
        if (flakyQueryFails) throw new Error('fixture query failed with private detail');
        return ctx.query(
          'select id, list_id as "listId", text, done from todos where list_id = ? order by sort_rank, id',
          [params.listId]
        ) as Promise<Array<typeof TodoRow._output>>;
      },
      subscribe() {
        if (flakySubscribeFails) throw new Error('fixture subscribe failed');
        return () => {};
      }
    }
  }),
  addTodoServer: serveMutation({
  mutation: addTodo,
  handler: async (tx, args, ctx) => {
    addHandlerRuns += 1;
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
  return server.mutateGroup(
    {
      clientId: 'test_client',
      mutationId: ids.newId('m'),
      calls: [{ name, args, ids: generated }]
    },
    principal
  );
}

beforeEach(async () => {
  addHandlerRuns = 0;
  flakyQueryFails = false;
  flakySubscribeFails = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  driver = betterSqlite3Driver(':memory:');
  db = {
    query: (text, params) => Promise.resolve(driver.all(text, params))
  };
  await db.query(`create table todos (
    id text primary key,
    list_id text not null,
    text text not null,
    done boolean not null,
    sort_rank real not null default 0
  )`);
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
  vi.restoreAllMocks();
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
    expect(snapshot.status).toEqual({ kind: 'live' });
  });

  test('unknown query and invalid params fail loudly', async () => {
    const connection = connect();
    await expect(connection.subscribe('nope.nope', {})).rejects.toThrow(/No query named/);
    await expect(connection.subscribe('todos.byList', { wrong: true })).rejects.toThrow(/invalid/i);
    await expect(
      connection.subscribe('todos.byList', { listId: 'l_1', extra: true })
    ).rejects.toThrow(/outside its JSON Schema contract/);
  });

  test('a failed source subscription leaves no connection state', async () => {
    const connection = connect();
    flakySubscribeFails = true;

    await expect(connection.subscribe('todos.flaky', { listId: 'l_1' })).rejects.toThrow(
      'fixture subscribe failed'
    );
    expect(connection.state().subscriptions).toEqual([]);

    flakySubscribeFails = false;
    await expect(connection.subscribe('todos.flaky', { listId: 'l_1' })).resolves.toMatchObject({
      query: 'todos.flaky'
    });
    expect(connection.state().subscriptions).toHaveLength(1);
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

  test('an order-only change emits an empty delta with the new full order', async () => {
    await mutate('todos.add', { listId: 'l_1', text: 'first' }, [ids.newId('todo')]);
    await mutate('todos.add', { listId: 'l_1', text: 'second' }, [ids.newId('todo')]);
    const connection = connect();
    const events = collectEvents(connection);
    const snapshot = await connection.subscribe('todos.byList', { listId: 'l_1' });
    const [firstId, secondId] = snapshot.rows.map((row) => String(row.id));

    await db.query('update todos set sort_rank = -1 where id = ?', [secondId]);
    const seq = await server.externalWrite({ tables: ['todos'], source: 'test:reorder' });

    expect(events).toContainEqual({
      type: 'delta',
      delta: {
        subscriptionId: snapshot.subscriptionId,
        query: todosByList.name,
        seq,
        puts: [],
        deletes: [],
        order: [secondId, firstId]
      }
    });
  });

  test('changed, unchanged, and unrelated commits each emit a checkpoint', async () => {
    const connection = connect();
    const events = collectEvents(connection);
    await connection.subscribe('todos.byList', { listId: 'l_1' });

    await mutate('todos.add', { listId: 'l_1', text: 'visible' }, [ids.newId('todo')]);
    await mutate('todos.add', { listId: 'l_other', text: 'unchanged' }, [ids.newId('todo')]);
    await mutate('notes.add', { body: 'unrelated' }, [ids.newId('note')]);

    expect(events.filter((event) => event.type === 'checkpoint')).toEqual([
      { type: 'checkpoint', seq: 1 },
      { type: 'checkpoint', seq: 2 },
      { type: 'checkpoint', seq: 3 }
    ]);
  });

  test('a failed SQL group does not block a healthy group or the committed mutation', async () => {
    const connection = connect();
    const events = collectEvents(connection);
    const healthy = await connection.subscribe('todos.byList', { listId: 'l_1' });
    const broken = await connection.subscribe('todos.broken', {});
    expect(broken.status).toMatchObject({ kind: 'error', error: { code: 'query_error' } });

    const result = await mutate('todos.add', { listId: 'l_1', text: 'committed' }, [ids.newId('todo')]);

    expect(result).toEqual({ ok: true, seq: 1 });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'delta',
      delta: expect.objectContaining({ subscriptionId: healthy.subscriptionId, seq: 1 })
    }));
    expect(events).toContainEqual({
      type: 'query_status',
      status: {
        subscriptionId: broken.subscriptionId,
        query: brokenTodos.name,
        seq: 1,
        status: {
          kind: 'error',
          error: { code: 'query_error', message: 'The live query failed.' }
        }
      }
    });
    expect(events).toContainEqual({ type: 'checkpoint', seq: 1 });
  });

  test('a failed rerun keeps rows stale and a later success returns live', async () => {
    await mutate('todos.add', { listId: 'l_1', text: 'kept' }, [ids.newId('todo')]);
    const connection = connect();
    const events = collectEvents(connection);
    const snapshot = await connection.subscribe('todos.flaky', { listId: 'l_1' });
    expect(snapshot.rows).toHaveLength(1);

    flakyQueryFails = true;
    const failedRerun = await mutate('todos.add', { listId: 'l_other', text: 'trigger' }, [ids.newId('todo')]);
    expect(failedRerun).toEqual({ ok: true, seq: 2 });
    expect(events).toContainEqual({
      type: 'query_status',
      status: {
        subscriptionId: snapshot.subscriptionId,
        query: flakyTodos.name,
        seq: 2,
        status: {
          kind: 'stale',
          error: { code: 'query_error', message: 'The live query failed.' }
        }
      }
    });
    expect(server.debugSubscriptions().find((entry) => entry.id === snapshot.subscriptionId)?.rows).toBe(1);

    flakyQueryFails = false;
    await mutate('todos.add', { listId: 'l_other', text: 'recover' }, [ids.newId('todo')]);
    expect(events).toContainEqual({
      type: 'query_status',
      status: {
        subscriptionId: snapshot.subscriptionId,
        query: flakyTodos.name,
        seq: 3,
        status: { kind: 'live' }
      }
    });
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

  test('a duplicate mutation returns its original seq without entering the handler again', async () => {
    const request = {
      clientId: 'test_client',
      mutationId: ids.newId('m'),
      calls: [{ name: 'todos.add', args: { listId: 'l_1', text: 'once' }, ids: [ids.newId('todo')] }]
    };
    const first = await server.mutateGroup(request, principal);
    const second = await server.mutateGroup(request, principal);
    expect(first).toEqual(second);
    expect(addHandlerRuns).toBe(1);
  });

  test('mutation args reject fields outside the generated JSON Schema contract', async () => {
    const result = await mutate('todos.add', { listId: 'l_1', text: 'x', extra: true }, [ids.newId('todo')]);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalid_args' }
    });
    expect(addHandlerRuns).toBe(0);
  });

  test('validates every group member before running the first handler', async () => {
    const result = await server.mutateGroup(
      {
        clientId: 'test_client',
        mutationId: ids.newId('m'),
        calls: [
          { name: 'todos.add', args: { listId: 'l_1', text: 'first' }, ids: [ids.newId('todo')] },
          { name: 'todos.add', args: { listId: 'l_1', text: 42 }, ids: [ids.newId('todo')] },
          { name: 'todos.add', args: { listId: 'l_1', text: 'third' }, ids: [ids.newId('todo')] }
        ]
      },
      principal
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_args' } });
    expect(addHandlerRuns).toBe(0);
    expect(await db.query('select * from wheel_sync_log')).toHaveLength(0);
  });

  test('commits three group members under one sequence and one log row', async () => {
    const result = await server.mutateGroup(
      {
        clientId: 'test_client',
        mutationId: ids.newId('m'),
        calls: ['first', 'second', 'third'].map((text) => ({
          name: 'todos.add',
          args: { listId: 'l_1', text },
          ids: [ids.newId('todo')]
        }))
      },
      principal
    );
    expect(result).toEqual({ ok: true, seq: 1 });
    expect(addHandlerRuns).toBe(3);
    expect(await db.query('select text from todos order by sort_rank')).toHaveLength(3);
    expect(await db.query('select * from wheel_sync_log')).toHaveLength(1);
  });

  test('rejects 129 group members without running a handler', async () => {
    const call = { name: 'todos.toggle', args: { todoId: 'todo_none' }, ids: [] };
    const result = await server.mutateGroup(
      { clientId: 'test_client', mutationId: ids.newId('m'), calls: Array.from({ length: 129 }, () => call) },
      principal
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'group_too_large' } });
    expect(await db.query('select * from wheel_sync_log')).toHaveLength(0);
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

  test('a later rejection rolls earlier group members back', async () => {
    const result = await server.mutateGroup(
      {
        clientId: 'test_client',
        mutationId: ids.newId('m'),
        calls: [
          {
            name: 'todos.add',
            args: { listId: 'l_1', text: 'must roll back' },
            ids: [ids.newId('todo')]
          },
          { name: 'todos.forbidden', args: {}, ids: [] }
        ]
      },
      principal
    );
    expect(result).toMatchObject({ ok: false, rejection: { code: 'forbidden' } });
    expect(await db.query("select * from todos where text = 'must roll back'")).toHaveLength(0);
    expect(await db.query('select * from wheel_sync_log')).toHaveLength(0);
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
  function expectError(result: Awaited<ReturnType<typeof server.mutateGroup>>, code: string, pattern: RegExp): void {
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
      await server.mutateGroup(
        { clientId: 'c', mutationId: 'not-an-id', calls: [{ name: 'todos.add', args: {}, ids: [] }] },
        principal
      ),
      'invalid_mutation_id',
      /not a valid m_/
    );
    expectError(await mutate('todos.add', { listId: 'l', text: 'x' }, ['garbage']), 'invalid_id', /not a valid prefixed/);
  });
});

describe('the boundary net', () => {
  test('snake_case drift returns an initial query error without exposing detail', async () => {
    await mutate('todos.add', { listId: 'l_1', text: 'x' }, [ids.newId('todo')]);
    const connection = connect();
    const snapshot = await connection.subscribe('todos.drifted', {});
    expect(snapshot.rows).toEqual([]);
    expect(snapshot.status).toEqual({
      kind: 'error',
      error: { code: 'query_error', message: 'The live query failed.' }
    });
  });

  test('duplicate result keys return an initial query error without exposing detail', async () => {
    await mutate('todos.add', { listId: 'l_1', text: 'duplicate me' }, [ids.newId('todo')]);
    const connection = connect();
    const snapshot = await connection.subscribe('todos.duplicates', {});
    expect(snapshot.rows).toEqual([]);
    expect(snapshot.status).toEqual({
      kind: 'error',
      error: { code: 'query_error', message: 'The live query failed.' }
    });
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
    expect(info).toMatchObject({ clientId: 'web_1', query: 'todos.byList', rows: 1, dependsOn: ['todos'] });
    expect(info.runs).toBeGreaterThanOrEqual(2); // snapshot + rerun
    expect(info.lastSeq).toBe(server.seq());
  });
});
