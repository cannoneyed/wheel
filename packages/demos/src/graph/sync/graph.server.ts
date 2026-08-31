/**
 * Graph server bindings — the authoritative half of graph.sync.ts. Every
 * handler mirrors its optimistic twin write-for-write; none of them mints an
 * id, on any branch (id rule 1).
 *
 * `from` and `to` are reserved words in SQLite, so the columns are
 * `from_id`/`to_id` and the query aliases them back to the row's field names
 * (`select from_id as "from"`). Same trick sheet.server.ts uses for `"row"`.
 */
import { sql } from 'wheel/sync';
import { serveMutation, serveQuery } from 'wheel/sync/server';

import {
  addEdge,
  addNode,
  deleteEdge,
  deleteNode,
  edgeListQuery,
  nodeList,
  pinNode,
  renameNode,
  restoreNode
} from './graph.sync';

/**
 * The seeded dataset: a fictional package-dependency graph for a framework
 * called "orbit" — 40 packages in four groups, ~50 dependency edges. Written
 * as data (not as fifty hand-typed INSERT statements) so it stays readable
 * and so the ids are derived, never typed twice.
 */
const SEED_NODES: ReadonlyArray<readonly [label: string, group: string]> = [
  ['kernel', 'core'], ['runtime', 'core'], ['scheduler', 'core'], ['signals', 'core'],
  ['atoms', 'core'], ['effects', 'core'], ['lifecycle', 'core'], ['registry', 'core'],
  ['logger', 'core'], ['errors', 'core'],
  ['view', 'ui'], ['render', 'ui'], ['dom', 'ui'], ['styles', 'ui'],
  ['motion', 'ui'], ['icons', 'ui'], ['forms', 'ui'], ['layout', 'ui'],
  ['overlay', 'ui'], ['theme', 'ui'],
  ['store', 'data'], ['query', 'data'], ['cache', 'data'], ['sync', 'data'],
  ['wire', 'data'], ['schema', 'data'], ['migrate', 'data'], ['index', 'data'],
  ['codec', 'data'], ['outbox', 'data'],
  ['cli', 'tools'], ['bundler', 'tools'], ['devtools', 'tools'], ['lint', 'tools'],
  ['format', 'tools'], ['test', 'tools'], ['bench', 'tools'], ['docs', 'tools'],
  ['deploy', 'tools'], ['watch', 'tools']
];

/** `[dependent, dependency]` — the arrow points at what the package needs. */
const SEED_EDGES: ReadonlyArray<readonly [from: string, to: string]> = [
  ['runtime', 'kernel'], ['scheduler', 'runtime'], ['signals', 'kernel'], ['atoms', 'signals'],
  ['effects', 'signals'], ['lifecycle', 'runtime'], ['registry', 'kernel'], ['logger', 'kernel'],
  ['errors', 'kernel'], ['scheduler', 'signals'],
  ['render', 'view'], ['dom', 'render'], ['styles', 'dom'], ['motion', 'dom'],
  ['icons', 'styles'], ['forms', 'dom'], ['layout', 'dom'], ['overlay', 'layout'],
  ['theme', 'styles'], ['view', 'signals'], ['render', 'effects'], ['forms', 'atoms'],
  ['overlay', 'lifecycle'],
  ['query', 'store'], ['cache', 'store'], ['sync', 'cache'], ['wire', 'sync'],
  ['schema', 'store'], ['migrate', 'schema'], ['index', 'store'], ['codec', 'wire'],
  ['outbox', 'sync'], ['store', 'atoms'], ['sync', 'scheduler'], ['query', 'signals'],
  ['codec', 'schema'],
  ['bundler', 'cli'], ['devtools', 'cli'], ['lint', 'cli'], ['format', 'cli'],
  ['test', 'cli'], ['bench', 'test'], ['docs', 'cli'], ['deploy', 'bundler'],
  ['watch', 'bundler'], ['devtools', 'registry'], ['test', 'runtime'], ['lint', 'schema'],
  ['docs', 'view'], ['bench', 'scheduler'], ['deploy', 'wire'], ['watch', 'dom'],
  ['cli', 'logger'], ['format', 'codec']
];

/** Stable row id for a seeded package. */
const nodeId = (label: string): string => `node_seed-${label}`;

/**
 * Schema + seed for a fresh SQLite database. `pin_x`/`pin_y` are nullable
 * `real` (positions are fractions), and every seeded node starts UNPINNED —
 * the layout the reader sees on first load is computed locally, not stored.
 */
export const GRAPH_SCHEMA = {
  create: [
    `create table nodes (
       id text primary key,
       label text not null,
       "group" text not null default 'core',
       pin_x real,
       pin_y real)`,
    `create table edges (
       id text primary key,
       from_id text not null,
       to_id text not null)`
  ],
  seed: [
    `insert into nodes (id, label, "group", pin_x, pin_y) values ${SEED_NODES.map(
      ([label, group]) => `('${nodeId(label)}', '${label}', '${group}', null, null)`
    ).join(', ')}`,
    `insert into edges (id, from_id, to_id) values ${SEED_EDGES.map(
      ([from, to]) => `('edge_seed-${from}-${to}', '${nodeId(from)}', '${nodeId(to)}')`
    ).join(', ')}`
  ]
};

export const nodeListServer = serveQuery({
  query: nodeList,
  sql: () => sql`select id, label, "group" as "group", pin_x as "pinX", pin_y as "pinY"
                 from nodes order by id`
});

export const edgeListServer = serveQuery({
  query: edgeListQuery,
  sql: () => sql`select id, from_id as "from", to_id as "to" from edges order by id`
});

export const addNodeServer = serveMutation({
  mutation: addNode,
  handler: async (tx, args) => {
    // Upsert mirrors cache.put (a redo of a restore may see the row already).
    await tx.sql`insert into nodes (id, label, "group", pin_x, pin_y)
                 values (${args.nodeId}, ${args.label}, ${args.group}, ${args.pinX ?? null}, ${args.pinY ?? null})
                 on conflict (id) do update
                   set label = excluded.label, "group" = excluded."group",
                       pin_x = excluded.pin_x, pin_y = excluded.pin_y`;
  }
});

export const renameNodeServer = serveMutation({
  mutation: renameNode,
  handler: async (tx, args) => {
    await tx.sql`update nodes set label = ${args.label} where id = ${args.nodeId}`;
  }
});

export const deleteNodeServer = serveMutation({
  mutation: deleteNode,
  handler: async (tx, args) => {
    // Edges first, so no moment of the transaction holds a dangling edge.
    await tx.sql`delete from edges where from_id = ${args.nodeId} or to_id = ${args.nodeId}`;
    await tx.sql`delete from nodes where id = ${args.nodeId}`;
  }
});

export const restoreNodeServer = serveMutation({
  mutation: restoreNode,
  handler: async (tx, args) => {
    await tx.sql`insert into nodes (id, label, "group", pin_x, pin_y)
                 values (${args.node.id}, ${args.node.label}, ${args.node.group},
                         ${args.node.pinX}, ${args.node.pinY})
                 on conflict (id) do update
                   set label = excluded.label, "group" = excluded."group",
                       pin_x = excluded.pin_x, pin_y = excluded.pin_y`;
    for (const edge of args.edges) {
      await tx.sql`insert into edges (id, from_id, to_id)
                   values (${edge.id}, ${edge.from}, ${edge.to})
                   on conflict (id) do update
                     set from_id = excluded.from_id, to_id = excluded.to_id`;
    }
  }
});

export const addEdgeServer = serveMutation({
  mutation: addEdge,
  handler: async (tx, args) => {
    await tx.sql`insert into edges (id, from_id, to_id)
                 values (${args.edgeId}, ${args.from}, ${args.to})
                 on conflict (id) do update
                   set from_id = excluded.from_id, to_id = excluded.to_id`;
  }
});

export const deleteEdgeServer = serveMutation({
  mutation: deleteEdge,
  handler: async (tx, args) => {
    await tx.sql`delete from edges where id = ${args.edgeId}`;
  }
});

export const pinNodeServer = serveMutation({
  mutation: pinNode,
  handler: async (tx, args) => {
    await tx.sql`update nodes set pin_x = ${args.pinX}, pin_y = ${args.pinY} where id = ${args.nodeId}`;
  }
});
