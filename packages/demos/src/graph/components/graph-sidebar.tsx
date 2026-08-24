/**
 * The instrument panel beside the canvas — and the demo's testability story.
 *
 * A WebGL canvas has no DOM: without this panel there is nothing for a
 * browser test (or a screen reader, or a debug session) to read or click. So
 * every fact the canvas draws has a plain-DOM mirror here, and every mutation
 * the pointer can trigger has a button that calls the SAME service action.
 * "Pin here" is literally `pin(id, x, y)` — the one a completed drag commits.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';
import { Button, Input } from 'wheel/components';

import { GROUPS, GraphService, type Group } from '../services/graph-service';
import { ViewportService } from '../services/viewport-service';
import styles from '../graph.module.css';

const connectGraphSidebar = connect('GraphSidebar', (c) => {
  const graphService = c.service(GraphService);
  const viewportService = c.service(ViewportService);
  return view(
    {
      nodes: () => graphService.nodes.rows,
      nodeCount: graphService.nodeCount,
      edgeCount: graphService.edgeCount,
      selected: graphService.selectedNode,
      selectedEdges: graphService.selectedEdges
    },
    {
      select: graphService.select,
      addNode: graphService.addNode,
      rename: graphService.rename,
      remove: graphService.remove,
      connect: graphService.connect,
      disconnect: graphService.disconnect,
      pinHere: graphService.pinHere,
      unpin: graphService.unpin,
      resetView: viewportService.reset
    }
  );
});

/** Node list, selection details, and every mutation as a button. */
export function GraphSidebar() {
  const state = connectGraphSidebar({});
  const [draftLabel, setDraftLabel] = useSignal('', 'draftLabel');
  const [newLabel, setNewLabel] = useSignal('', 'newLabel');
  const [newGroup, setNewGroup] = useSignal<Group>('core', 'newGroup');
  const [edgeTarget, setEdgeTarget] = useSignal('', 'edgeTarget');

  const addNode = () => {
    const label = newLabel().trim();
    if (!label) {
      return;
    }
    state.addNode(label, newGroup());
    setNewLabel('');
  };

  const renameSelected = (nodeId: string) => {
    state.rename(nodeId, draftLabel());
    setDraftLabel('');
  };

  const connectSelected = (nodeId: string) => {
    const target = edgeTarget();
    if (target) {
      state.connect(nodeId, target);
      setEdgeTarget('');
    }
  };

  return (
    <aside use:componentRoot class={styles.sidebar} data-testid="graph-sidebar">
      <p class={styles.counts} data-testid="graph-counts">
        {state.nodeCount} nodes · {state.edgeCount} edges
      </p>

      <div class={styles.addRow}>
        <Input
          type="text"
          placeholder="New package…"
          data-testid="graph-new-label"
          value={newLabel()}
          onInput={(event) => setNewLabel(event.currentTarget.value)}
          onKeyDown={(event) => event.key === 'Enter' && addNode()}
        />
        <select
          data-testid="graph-new-group"
          value={newGroup()}
          onChange={(event) => setNewGroup(event.currentTarget.value as Group)}
        >
          <For each={GROUPS}>{(group) => <option value={group}>{group}</option>}</For>
        </select>
        <Button data-testid="graph-add-node" onClick={addNode}>
          Add
        </Button>
      </div>

      <Show
        when={state.selected}
        keyed
        fallback={
          <p class={styles.empty} data-testid="graph-no-selection">
            Click a node on the stage, or pick one below.
          </p>
        }
      >
        {(node) => (
          <div class={styles.selection} data-testid="graph-selection">
            <h2 class={styles.selectionTitle} data-testid="graph-selected-label">
              {node.label}
            </h2>
            <p class={styles.meta}>
              <span class={styles.groupTag} data-group={node.group}>
                {node.group}
              </span>
              <span data-testid="graph-pin-state">{node.pinX === null ? 'unpinned' : 'pinned'}</span>
            </p>

            <div class={styles.addRow}>
              <Input
                type="text"
                placeholder="Rename to…"
                data-testid="graph-rename-input"
                value={draftLabel()}
                onInput={(event) => setDraftLabel(event.currentTarget.value)}
                onKeyDown={(event) => event.key === 'Enter' && renameSelected(node.id)}
              />
              <Button data-testid="graph-rename" onClick={() => renameSelected(node.id)}>
                Rename
              </Button>
            </div>

            <div class={styles.buttonRow}>
              <Button data-testid="graph-pin-here" onClick={() => state.pinHere(node.id)}>
                Pin here
              </Button>
              <Button
                data-testid="graph-release-pin"
                disabled={node.pinX === null}
                onClick={() => state.unpin(node.id)}
              >
                Release pin
              </Button>
              <Button data-testid="graph-delete-node" onClick={() => state.remove(node.id)}>
                Delete
              </Button>
            </div>

            <div class={styles.addRow}>
              <select
                data-testid="graph-edge-target"
                value={edgeTarget()}
                onChange={(event) => setEdgeTarget(event.currentTarget.value)}
              >
                <option value="">Depends on…</option>
                <For each={state.nodes.filter((row) => row.id !== node.id)}>
                  {(row) => <option value={row.id}>{row.label}</option>}
                </For>
              </select>
              <Button data-testid="graph-add-edge" onClick={() => connectSelected(node.id)}>
                Connect
              </Button>
            </div>

            <ul class={styles.edgeList} data-testid="graph-edge-list">
              <For each={state.selectedEdges}>
                {(edge) => (
                  <li class={styles.edgeRow}>
                    <span>
                      {edge.fromLabel} → {edge.toLabel}
                    </span>
                    <Button
                      class={styles.linkButton}
                      data-testid={`graph-delete-edge-${edge.id}`}
                      onClick={() => state.disconnect(edge.id)}
                    >
                      remove
                    </Button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        )}
      </Show>

      <ul class={styles.nodeList} data-testid="graph-node-list">
        <For each={state.nodes}>
          {(row) => (
            <li>
              <Button
                class={styles.nodeButton}
                data-node-id={row.id}
                data-group={row.group}
                onClick={() => state.select(row.id)}
              >
                {row.label}
              </Button>
            </li>
          )}
        </For>
      </ul>

      <Button class={styles.linkButton} data-testid="graph-reset-view" onClick={() => state.resetView()}>
        reset view
      </Button>
    </aside>
  );
}
