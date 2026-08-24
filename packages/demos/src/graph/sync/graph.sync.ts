/**
 * Graph sync module — the shared client/server contract for the force-graph
 * demo, and the sharpest statement of the synced-vs-derived line in this repo:
 *
 *   SYNCED (rows here): which nodes exist, what they are called, which group
 *     they belong to, which edges connect them, and the OPTIONAL pin a user
 *     deliberately dropped by dragging a node and letting go.
 *   DERIVED (never synced, never in an atom): every live x/y position and
 *     velocity. Each client re-runs the same seeded simulation over the same
 *     rows, so two windows agree without a single coordinate crossing the
 *     wire. Only `pinX`/`pinY` — one mutation per completed drag — are
 *     coordinates the engine ever sees.
 *
 * Id discipline (content/docs/server-advanced.mdx, "The four id rules"):
 *   1. No handler in this file calls `ctx.newId`, on ANY branch, so the two
 *      sides' id streams are trivially aligned — a delete that cascades ten
 *      edges mints exactly as many ids as one that cascades none: zero.
 *   2. Every creating mutation carries its new id in `args` (`nodeId`,
 *      `edgeId`), minted by the caller with `client.newId`, so `invert` —
 *      which runs BEFORE the optimistic apply — can name what to remove.
 *   3. The server authors no rows of its own, so rule 3 has nothing to bite.
 *   4. No field is server-assigned; there are no sentinels to render.
 */
import { mutation, query, t, table, presence, type Infer, type InverseSpec, type MutationDecl } from 'wheel/sync';

/** Which slice of the fictional package graph a node belongs to (its color). */
export const NodeGroup = t.enum(['core', 'ui', 'data', 'tools']);

/**
 * One graph node. `pinX`/`pinY` are null for the overwhelming majority of
 * nodes: the simulation decides where they live. A non-null pair means a user
 * dragged this node and dropped it there, and the simulation must respect it.
 */
export const NodeRow = t.object({
  id: t.string(),
  label: t.string(),
  group: NodeGroup,
  pinX: t.number().nullable(),
  pinY: t.number().nullable()
});

/**
 * One directed edge. The row fields are `from`/`to`; the SQL columns are
 * `from_id`/`to_id` because `from` and `to` are reserved words in SQLite —
 * graph.server.ts aliases them back at the read seam.
 */
export const EdgeRow = t.object({
  id: t.string(),
  from: t.string(),
  to: t.string()
});

type GraphNode = Infer<typeof NodeRow>;
type GraphEdge = Infer<typeof EdgeRow>;
export type { GraphNode, GraphEdge };
export type Group = Infer<typeof NodeGroup>;

export const nodes = table({ name: 'nodes', type: NodeRow, key: (row) => row.id });
export const edges = table({ name: 'edges', type: EdgeRow, key: (row) => row.id });

/** Every node, id-ordered so both sides build the position buffers identically. */
export const nodeList = query({
  name: 'nodes.all',
  params: t.object({}),
  into: nodes,
  projection: {
    filter: () => true,
    sort: (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  }
});

/** Every edge, id-ordered for the same reason. */
export const edgeListQuery = query({
  name: 'edges.all',
  params: t.object({}),
  into: edges,
  projection: {
    filter: () => true,
    sort: (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  }
});

/**
 * Live pointer state, in WORLD coordinates (not screen pixels — peers run
 * their own viewports). `draggingNodeId` is the node the peer currently has
 * under the pointer. Presence, so a 120 Hz drag costs zero rows, zero
 * history, zero undo entries — the pin at the end of it is the only mutation.
 */
export const graphPresence = presence({
  name: 'graph',
  state: t.object({
    x: t.number().nullable(),
    y: t.number().nullable(),
    draggingNodeId: t.string().nullable()
  })
});

const AddNodeArgs = t.object({
  nodeId: t.string(),
  label: t.string(),
  group: NodeGroup,
  pinX: t.number().nullable().optional(),
  pinY: t.number().nullable().optional()
});
type AddNodeArgs = Infer<typeof AddNodeArgs>;

const DeleteNodeArgs = t.object({ nodeId: t.string() });
type DeleteNodeArgs = Infer<typeof DeleteNodeArgs>;

const RestoreNodeArgs = t.object({ node: NodeRow, edges: t.array(EdgeRow) });
type RestoreNodeArgs = Infer<typeof RestoreNodeArgs>;

/** Create a node. Inverse: delete it (which is why `nodeId` is args-borne). */
export const addNode: MutationDecl<AddNodeArgs> = mutation({
  name: 'nodes.add',
  args: AddNodeArgs,
  optimistic: (cache, args) => {
    cache.put(nodes, {
      id: args.nodeId,
      label: args.label,
      group: args.group,
      pinX: args.pinX ?? null,
      pinY: args.pinY ?? null
    });
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: deleteNode,
    args: { nodeId: args.nodeId },
    description: 'add node'
  })
});

/** Rename a node. Inverse: the previous label. */
export const renameNode = mutation({
  name: 'nodes.rename',
  args: t.object({ nodeId: t.string(), label: t.string() }),
  optimistic: (cache, args) => {
    if (cache.get(nodes, args.nodeId)) {
      cache.update(nodes, args.nodeId, { label: args.label });
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(nodes, args.nodeId);
    return row === undefined
      ? null
      : { mutation: renameNode, args: { nodeId: args.nodeId, label: row.label }, description: 'rename node' };
  }
});

/**
 * Drop a node AND every edge touching it — one mutation, one undo step, no
 * dangling edges at any point on either side. The cascade is why the inverse
 * is `restoreNode` (node + edges) rather than a bare `addNode`.
 */
export const deleteNode: MutationDecl<DeleteNodeArgs> = mutation({
  name: 'nodes.delete',
  args: DeleteNodeArgs,
  optimistic: (cache, args) => {
    for (const edge of cache.list(edges)) {
      if (edge.from === args.nodeId || edge.to === args.nodeId) {
        cache.delete(edges, edge.id);
      }
    }
    cache.delete(nodes, args.nodeId);
  },
  invert: (reader, args): InverseSpec | null => {
    const node = reader.get(nodes, args.nodeId);
    if (node === undefined) {
      return null;
    }
    const touching = reader.list(edges).filter((edge) => edge.from === args.nodeId || edge.to === args.nodeId);
    return {
      mutation: restoreNode,
      args: { node, edges: touching },
      description: 'delete node'
    };
  }
});

/** Put a deleted node and its edges back byte-exactly. The undo of a cascade. */
export const restoreNode: MutationDecl<RestoreNodeArgs> = mutation({
  name: 'nodes.restore',
  args: RestoreNodeArgs,
  optimistic: (cache, args) => {
    cache.put(nodes, args.node);
    for (const edge of args.edges) {
      cache.put(edges, edge);
    }
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: deleteNode,
    args: { nodeId: args.node.id },
    description: 'restore node'
  })
});

/** Connect two nodes. Inverse: delete the edge. */
export const addEdge = mutation({
  name: 'edges.add',
  args: t.object({ edgeId: t.string(), from: t.string(), to: t.string() }),
  optimistic: (cache, args) => {
    cache.put(edges, { id: args.edgeId, from: args.from, to: args.to });
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: deleteEdge,
    args: { edgeId: args.edgeId },
    description: 'add edge'
  })
});

/** Drop one edge. Inverse: re-create it with the same id and endpoints. */
export const deleteEdge = mutation({
  name: 'edges.delete',
  args: t.object({ edgeId: t.string() }),
  optimistic: (cache, args) => {
    cache.delete(edges, args.edgeId);
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(edges, args.edgeId);
    return row === undefined
      ? null
      : {
          mutation: addEdge,
          args: { edgeId: row.id, from: row.from, to: row.to },
          description: 'delete edge'
        };
  }
});

/**
 * The ONE coordinate write in this demo: a completed drag pins a node, and
 * releasing the pin is the same mutation with nulls. Everything in between —
 * every intermediate pointer position at 120 Hz — rode presence and left no
 * trace. Inverse: whatever the pin was before.
 */
export const pinNode = mutation({
  name: 'nodes.pin',
  args: t.object({ nodeId: t.string(), pinX: t.number().nullable(), pinY: t.number().nullable() }),
  optimistic: (cache, args) => {
    if (cache.get(nodes, args.nodeId)) {
      cache.update(nodes, args.nodeId, { pinX: args.pinX, pinY: args.pinY });
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(nodes, args.nodeId);
    return row === undefined
      ? null
      : {
          mutation: pinNode,
          args: { nodeId: args.nodeId, pinX: row.pinX, pinY: row.pinY },
          description: args.pinX === null ? 'release pin' : 'pin node'
        };
  }
});
