// @vitest-environment node
/**
 * The QueryHandler adapter: sugar desugars to SqlQueryHandler, declaration
 * validation fires early, and a push-based handler drives the full
 * snapshot → invalidate → re-run → diff → delta pipeline through a real
 * engine.
 */
import { describe, expect, test, vi } from 'vitest';

import { mutation, query, table } from '../declarations';
import { t } from '../schema';
import { sql } from '../sql';
import { serveMutation, serveQuery } from './serve';
import { SqlQueryHandler, type QueryHandler } from './query-handler';
import { createSyncServer } from './node-engine';
import { betterSqlite3Driver } from './backends/sqlite-driver';

const NoteRow = t.object({ id: t.string(), text: t.string() });
const notes = table({ name: 'notes', type: NoteRow, key: (row) => row.id });
const notesAll = query({ name: 'notes.all', params: t.object({}), into: notes });

describe('serveQuery forms', () => {
  test('sugar desugars to a SqlQueryHandler with rerunOn hints', () => {
    const binding = serveQuery({
      query: notesAll,
      sql: () => sql`select id, text from notes`,
      rerunOn: ['notes']
    });
    expect(binding.handler.kind).toBe('sqlite');
    expect(binding.handler.rerunOn).toEqual(['notes']);
    expect(binding.handler.sql).toBeDefined();
  });

  test('a handler with no invalidation channel is refused at declaration time', () => {
    expect(() =>
      serveQuery({
        query: notesAll,
        handler: { kind: 'broken', run: async () => [] }
      })
    ).toThrow(/rerunOn table hints and\/or a subscribe channel/);
    expect(() => SqlQueryHandler({ sql: () => sql`select 1`, rerunOn: [] })).toThrow(
      /at least one table/
    );
  });
});

describe('push-based handlers', () => {
  test('subscribe → invalidate → delta-only-on-change, unsubscribe on close', async () => {
    // An in-memory backend: rows live in an array; `invalidate` is captured.
    let rows: Array<{ id: string; text: string }> = [
      { id: 'note_0190b62e-0000-7000-8000-000000000001', text: 'first' }
    ];
    let pushInvalidate: (() => void) | null = null;
    const unsubscribe = vi.fn();
    const memoryHandler: QueryHandler = {
      kind: 'memory',
      run: async () => rows.map((row) => ({ ...row })),
      subscribe: (_params, invalidate) => {
        pushInvalidate = invalidate;
        return unsubscribe;
      }
    };

    const driver = betterSqlite3Driver(':memory:');
    // Engine boot installs touch-triggers on every DECLARED table, so the
    // table must exist physically even when a handler is the row source.
    // (A full external backend lifts this via the SyncBackend seam.)
    driver.exec('create table notes (id text primary key, text text not null)');
    const touch = mutation({ name: 'notes.touch', args: t.object({}) });
    const server = await createSyncServer({
      sqlite: { driver },
      syncModules: [{ notes, notesAll, touch }],
      servers: [
        {
          notesServer: serveQuery({ query: notesAll, handler: memoryHandler }),
          touchServer: serveMutation({
            mutation: touch,
            handler: async () => {}
          })
        }
      ]
    });

    const events: unknown[] = [];
    const connection = server.connect('web_push', {
      actor: 'user:test',
      workspaceId: 'workspace:test',
      sessionId: 'session:test'
    });
    connection.onEvent((event) => events.push(event));
    const snapshot = await connection.subscribe('notes.all', {});
    expect(snapshot.rows).toEqual([{ id: 'note_0190b62e-0000-7000-8000-000000000001', text: 'first' }]);
    expect(pushInvalidate).not.toBeNull();

    // Backend changes → invalidate → exactly one delta with the new row.
    rows = [...rows, { id: 'note_0190b62e-0000-7000-8000-000000000002', text: 'second' }];
    pushInvalidate!();
    await server.idle();
    const deltas = events.filter((e): e is { type: 'delta'; delta: { puts: unknown[] } } => (e as { type: string }).type === 'delta');
    expect(deltas.length).toBe(1);
    expect(deltas[0].delta.puts).toEqual([{ id: 'note_0190b62e-0000-7000-8000-000000000002', text: 'second' }]);

    // Invalidate with NO change → re-run happens, nothing is emitted.
    pushInvalidate!();
    await server.idle();
    expect(events.filter((e) => (e as { type: string }).type === 'delta').length).toBe(1);

    // Closing the connection tears down the handler channel.
    connection.close();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    await server.close();
  });
});
