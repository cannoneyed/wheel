/**
 * The graph feature service: the ONLY place this demo touches synced data,
 * and the home of everything the canvas is NOT allowed to own.
 *
 * The division of labour that makes a WebGL canvas debuggable and testable:
 *
 *   HERE (atoms + rows, visible to `window.__wheel`, the debug panel, and
 *   Playwright): which nodes and edges exist, which node is selected, whether
 *   the layout has settled, undo/redo availability, peers.
 *
 *   IN THE COMPONENT (plain `let`, never an atom): the `Float32Array`
 *   position buffers and the renderer handle. `Atom.set` deep-freezes on
 *   every write, so a typed array in an atom is a dead typed array.
 *
 * The seam between them is `registerProbe`: the component hands this service
 * a plain pair of functions for reading the live layout, so `selectAt` — the
 * action the pointer handler AND the browser test both call — can hit-test
 * without the service ever holding a buffer.
 */
import { type ServiceContext } from 'wheel/core';
import { SyncService } from 'wheel/sync';
import { KeyboardService } from 'wheel/kit';

import {
  addEdge,
  addNode,
  deleteEdge,
  deleteNode,
  edgeListQuery,
  graphPresence,
  nodeList,
  pinNode,
  renameNode,
  type GraphEdge,
  type GraphNode,
  type Group
} from '../sync/graph.sync';

export type { GraphNode, GraphEdge, Group };

/** The group order everything downstream indexes by (colors, seeds, legend). */
export const GROUPS: readonly Group[] = ['core', 'ui', 'data', 'tools'];

/** One edge of the selected node, with both endpoints already named. */
export interface SelectedEdge {
  readonly id: string;
  readonly fromLabel: string;
  readonly toLabel: string;
}

/** One peer's live pointer, as the canvas wants it. */
export interface GraphPeer {
  readonly clientId: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly draggingNodeId: string | null;
}

/**
 * The component's read-only window onto the live layout. Plain functions over
 * plain buffers — nothing reactive crosses this seam in either direction.
 */
export interface LayoutProbe {
  /** Nearest node id to a world point within the hit radius, or null. */
  readonly pick: (worldX: number, worldY: number) => string | null;
  /** A node's CURRENT simulated position — what a "pin here" writes. */
  readonly positionOf: (nodeId: string) => { x: number; y: number } | null;
}

/** Stable per-peer color derived from the client id (same trick as the editor demo). */
function peerColor(clientId: string): string {
  let hash = 0;
  for (let index = 0; index < clientId.length; index += 1) {
    hash = (hash * 31 + clientId.charCodeAt(index)) | 0;
  }
  // wheel-color: a peer's identity color is derived from their client id, so it cannot come from a fixed token — the whole point is that every peer gets a different hue.
  return `hsl(${((hash % 360) + 360) % 360} 75% 60%)`;
}

/** Owns both subscriptions, every graph mutation, selection, and presence. */
export class GraphService extends SyncService {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'GraphService';

  constructor(context: ServiceContext) {
    super(context);
    const keyboardService = this.service(KeyboardService);
    this.addCleanup(
      keyboardService.register({ id: 'graph.undo', key: 'mod+z', run: () => this.undo(), when: this.canUndo })
    );
    this.addCleanup(
      keyboardService.register({ id: 'graph.redo', key: 'mod+shift+z', run: () => this.redo(), when: this.canRedo })
    );
  }

  /** Every node. Read `.rows` / `.status` directly. */
  readonly nodes = this.liveQuery(nodeList, {});
  /** Every edge. */
  readonly edges = this.liveQuery(edgeListQuery, {});

  private readonly selectedIdAtom = this.atom<string | null>(null, 'selectedId');
  private readonly settledAtom = this.atom(false, 'settled');

  // Runtime handles use fields. The probe is the component's callback for
  // reading live buffers. Field writes stay non-reactive but remain visible.
  private readonly probe = this.field<LayoutProbe | null>(null);

  /** The selected node's id, or null. */
  readonly selectedId = this.computed(() => this.selectedIdAtom.get(), 'selectedId');
  /** Whether the force simulation has come to rest (mirrored into the DOM for tests). */
  readonly settled = this.computed(() => this.settledAtom.get(), 'settled');
  /** How many nodes the graph holds. */
  readonly nodeCount = this.computed(() => this.nodes.rows.length, 'nodeCount');
  /** How many edges the graph holds. */
  readonly edgeCount = this.computed(() => this.edges.rows.length, 'edgeCount');

  /** The selected node's row, or undefined. */
  readonly selectedNode = this.computed((): GraphNode | undefined => {
    const id = this.selectedIdAtom.get();
    return id === null ? undefined : this.nodes.rows.find((row) => row.id === id);
  }, 'selectedNode');

  /**
   * Every edge touching the selected node — what a delete would cascade —
   * with both endpoints already resolved to labels. Resolved HERE rather than
   * in the component so the row stays a zero-argument reactive read: a
   * keyed lookup in a `view()` reads object would be called with no arguments.
   */
  readonly selectedEdges = this.computed((): readonly SelectedEdge[] => {
    const id = this.selectedIdAtom.get();
    if (id === null) {
      return [];
    }
    const label = (nodeId: string): string =>
      this.nodes.rows.find((row) => row.id === nodeId)?.label ?? nodeId;
    return this.edges.rows
      .filter((edge) => edge.from === id || edge.to === id)
      .map((edge) => ({ id: edge.id, fromLabel: label(edge.from), toLabel: label(edge.to) }));
  }, 'selectedEdges');

  /** Whether an invertible local mutation is available to undo. */
  readonly canUndo = this.clientRead((): boolean => this.client.canUndo());
  /** Whether an undone mutation is available to redo. */
  readonly canRedo = this.clientRead((): boolean => this.client.canRedo());

  /** Peers' live pointers, in world coordinates. Typed read: a mismatched peer surfaces in `.failures`. */
  readonly peers = this.clientRead((): readonly GraphPeer[] =>
    [...this.client.peers(graphPresence).valid.entries()]
      .filter(([, state]) => state.x !== null && state.y !== null)
      .map(([clientId, state]) => ({
        clientId,
        color: peerColor(clientId),
        x: state.x ?? 0,
        y: state.y ?? 0,
        draggingNodeId: state.draggingNodeId
      }))
  );

  /**
   * How many peers are pointing at this graph right now. The canvas draws
   * their cursors in WebGL, where no test and no screen reader can see them —
   * so the count is also mirrored into the DOM (rule 2: data ABOUT the
   * imperative core lives in atoms and reads, not only in pixels).
   */
  readonly peerCount = this.computed((): number => this.peers().length, 'peerCount');

  /** The canvas registers its live-buffer readers here; returns the unregister. */
  registerProbe(probe: LayoutProbe): () => void {
    this.probe.set(probe);
    return () => {
      if (this.probe.get() === probe) {
        this.probe.set(null);
      }
    };
  }

  /** Select a node by id (or clear the selection with null). */
  readonly select = this.action((nodeId: string | null) => {
    this.selectedIdAtom.set(nodeId);
  }, 'select');

  /**
   * Hit-test a world point and select what's under it. The canvas pointer
   * handler calls this; so does the browser test, which is the whole reason
   * the hit test is an action instead of a closure inside a pointer listener.
   */
  readonly selectAt = this.action((worldX: number, worldY: number): string | null => {
    const hit = this.probe.get()?.pick(worldX, worldY) ?? null;
    this.selectedIdAtom.set(hit);
    return hit;
  }, 'selectAt');

  /** The simulation reports its running/settled transitions here (never per frame). */
  readonly setSettled = this.action((settled: boolean) => {
    this.settledAtom.set(settled);
  }, 'setSettled');

  /**
   * Add a node, connected to the current selection when there is one, in ONE
   * undo step per row written (the node and its edge are two mutations — the
   * demo keeps them separate so "undo" peels the edge, then the node).
   */
  readonly addNode = (label: string, group: Group): string => {
    const nodeId = this.client.newId('node');
    this.mutate(addNode, { nodeId, label, group });
    this.selectedIdAtom.set(nodeId);
    return nodeId;
  };

  /** Rename a node. One mutation, one undo step. */
  readonly rename = (nodeId: string, label: string): void => {
    const row = this.nodes.rows.find((node) => node.id === nodeId);
    if (!row || row.label === label.trim() || label.trim() === '') {
      return; // no-op edits never pollute the undo stack
    }
    this.mutate(renameNode, { nodeId, label: label.trim() });
  };

  /** Delete a node AND its edges in one mutation. Undo restores all of it. */
  readonly remove = (nodeId: string): void => {
    this.mutate(deleteNode, { nodeId });
    if (this.selectedIdAtom.get() === nodeId) {
      this.selectedIdAtom.set(null);
    }
  };

  /** Connect two nodes. Duplicate and self edges are refused before mutating. */
  readonly connect = (from: string, to: string): string | null => {
    if (from === to || this.edges.rows.some((edge) => edge.from === from && edge.to === to)) {
      return null;
    }
    const edgeId = this.client.newId('edge');
    this.mutate(addEdge, { edgeId, from, to });
    return edgeId;
  };

  /** Drop one edge. */
  readonly disconnect = (edgeId: string): void => {
    this.mutate(deleteEdge, { edgeId });
  };

  /**
   * THE one coordinate write. A drag calls this exactly once, on pointerup —
   * every frame in between rode presence. `pinHere` is the same action from a
   * button, reading the node's current simulated position through the probe.
   */
  readonly pin = (nodeId: string, worldX: number, worldY: number): void => {
    this.mutate(pinNode, { nodeId, pinX: worldX, pinY: worldY });
  };

  /** Pin a node where the simulation currently has it (the sidebar's button). */
  readonly pinHere = (nodeId: string): void => {
    const at = this.probe.get()?.positionOf(nodeId);
    if (at) {
      this.pin(nodeId, at.x, at.y);
    }
  };

  /** Release a pin and hand the node back to the simulation. */
  readonly unpin = (nodeId: string): void => {
    this.mutate(pinNode, { nodeId, pinX: null, pinY: null });
  };

  /**
   * Publish the local pointer, in world coordinates, on the presence channel.
   * Coalesced at 60ms: a 120 Hz drag costs about 16 WebSocket messages per second and
   * writes nothing to the database — the pin on release is the only row.
   */
  readonly publishPointer = (worldX: number | null, worldY: number | null, draggingNodeId: string | null): void => {
    this.client.setPresence(
      graphPresence,
      { x: worldX, y: worldY, draggingNodeId },
      // A leave (null pointer) sends immediately so peers never see a ghost.
      worldX === null ? undefined : { coalesceMs: 60 }
    );
  };

  /** Undo the newest invertible mutation. */
  readonly undo = (): void => {
    this.client.undo();
  };

  /** Redo the newest undone mutation. */
  readonly redo = (): void => {
    this.client.redo();
  };
}
