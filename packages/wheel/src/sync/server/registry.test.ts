import { describe, expect, test } from 'vitest';
import { serveMutation, serveQuery } from './serve';
import { mutation, query, table } from '../declarations';
import { buildRegistry, collectDeclarations, RegistryError } from './registry';
import { t } from '../schema';
import { sql } from '../sql';

const Row = t.object({ id: t.string(), listId: t.string() });
const makeSyncModule = () => {
  const todos = table({ name: 'todos', type: Row, key: (row) => row.id });
  const byList = query({
  name: 'todos.byList', params: t.object({ listId: t.string() }), into: todos });
  const add = mutation({
  name: 'todos.add', args: t.object({ listId: t.string() }) });
  return { todos, byList, add };
};

const makeServers = (syncModule: ReturnType<typeof makeSyncModule>) => ({
  byListServer: serveQuery({
  query: syncModule.byList, sql: (p) => sql`select * from todos where list_id = ${p.listId}`, rerunOn: ['todos'] }),
  addServer: serveMutation({
  mutation: syncModule.add,
  handler: async () => {}
})
});

describe('collectDeclarations', () => {
  test('collects tables, queries, mutations from module exports', () => {
    const syncModule = makeSyncModule();
    const decls = collectDeclarations([syncModule]);
    expect([...decls.tables.keys()]).toEqual(['todos']);
    expect([...decls.queries.keys()]).toEqual(['todos.byList']);
    expect([...decls.mutations.keys()]).toEqual(['todos.add']);
  });

  test('duplicate names across syncModules fail with both declaration sites', () => {
    const a = makeSyncModule();
    const b = makeSyncModule();
    expect(() => collectDeclarations([a, b])).toThrow(RegistryError);
    expect(() => collectDeclarations([a, b])).toThrow(/Duplicate table name "todos"/);
  });

  test('the same declaration re-exported twice is not a duplicate', () => {
    const syncModule = makeSyncModule();
    expect(() => collectDeclarations([syncModule, { alias: syncModule.todos }])).not.toThrow();
  });

  test('a query into an undeclared table fails', () => {
    const syncModule = makeSyncModule();
    const { todos: _omit, ...withoutTable } = syncModule;
    expect(() => collectDeclarations([withoutTable])).toThrow(/targets table "todos"/);
  });
});

describe('buildRegistry cross-check', () => {
  test('a fully bound sync module passes', () => {
    const syncModule = makeSyncModule();
    const registry = buildRegistry({ syncModules: [syncModule], servers: [makeServers(syncModule)] });
    expect(registry.queryBindings.has('todos.byList')).toBe(true);
    expect(registry.mutationBindings.has('todos.add')).toBe(true);
  });

  test('a declaration without an implementation fails startup', () => {
    const syncModule = makeSyncModule();
    const servers = makeServers(syncModule);
    expect(() => buildRegistry({ syncModules: [syncModule], servers: [{ addServer: servers.addServer }] })).toThrow(
      /Query "todos.byList" .* has no server implementation/
    );
  });

  test('an orphan implementation fails startup', () => {
    const syncModule = makeSyncModule();
    const orphanModule = makeSyncModule();
    // Bind against a declaration that is NOT part of the registered syncModules.
    const orphan = serveMutation({
  mutation: orphanModule.add,
  handler: async () => {}
});
    const okServers = makeServers(syncModule);
    expect(() =>
      buildRegistry({
        syncModules: [syncModule],
        servers: [{ ...okServers, orphan: Object.assign({}, orphan, { name: 'other.thing' }) }]
      })
    ).toThrow(/has no matching declaration/);
  });

  test('a same-name recreated declaration cannot masquerade as the registered declaration', () => {
    const syncModule = makeSyncModule();
    const recreated = makeSyncModule();
    const servers = makeServers(syncModule);
    const wrongBinding = serveMutation({
      mutation: recreated.add,
      handler: async () => {}
    });

    expect(() =>
      buildRegistry({
        syncModules: [syncModule],
        servers: [{ byListServer: servers.byListServer, wrongBinding }]
      })
    ).toThrow(/does not bind the exact declaration exported by the syncModule/);
  });

  test('a double implementation fails startup', () => {
    const syncModule = makeSyncModule();
    const serversA = makeServers(syncModule);
    const serversB = { extra: serveMutation({
  mutation: syncModule.add,
  handler: async () => {}
}) };
    expect(() => buildRegistry({ syncModules: [syncModule], servers: [serversA, serversB] })).toThrow(
      /implemented twice/
    );
  });

  test('a rerun hint naming an undeclared table fails startup', () => {
    const syncModule = makeSyncModule();
    const servers = {
      byListServer: serveQuery({
  query: syncModule.byList, sql: () => sql`select 1`, rerunOn: ['nope'] }),
      addServer: serveMutation({
  mutation: syncModule.add,
  handler: async () => {}
})
    };
    expect(() => buildRegistry({ syncModules: [syncModule], servers: [servers] })).toThrow(/reruns on table "nope"/);
  });

  test('registry errors name declaration sites so agents can grep', () => {
    const syncModule = makeSyncModule();
    try {
      buildRegistry({ syncModules: [syncModule], servers: [] });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('.ts');
    }
  });
});

describe('declaration validation', () => {
  test('bad names fail at declaration time', () => {
    expect(() => table({ name: 'Todos', type: Row, key: (row) => row.id })).toThrow(/Invalid table name/);
    expect(() => query({
  name: 'noDot', params: t.object({}), into: table({ name: 'x', type: Row, key: (r) => r.id }) })).toThrow(
      /Invalid query name/
    );
    expect(() => mutation({
  name: 'also bad', args: t.object({}) })).toThrow(/Invalid mutation name/);
  });

  test('serveQuery requires at least one watched table', () => {
    const syncModule = makeSyncModule();
    expect(() => serveQuery({
  query: syncModule.byList, sql: () => sql`select 1`, rerunOn: [] })).toThrow(/at least one table/);
  });
});
