/**
 * Undo/redo for the stage toolbar. Same shape as the editor demo's
 * HistoryControls: the buttons never unmount (the toolbar's no-layout-shift
 * rule), they only disable, and they share one code path with mod+z /
 * mod+shift+z registered by GraphService.
 *
 * Undo here is worth watching: a drag that pinned a node inverts back to
 * whatever the pin was before, and deleting a node restores it AND every edge
 * the delete cascaded — in one step.
 */
import Redo2 from 'lucide-solid/icons/redo-2';
import Undo2 from 'lucide-solid/icons/undo-2';
import { componentRoot, connect, view } from 'wheel/core';
import { Button } from 'wheel/components';

import { GraphService } from '../services/graph-service';
import styles from '../graph.module.css';

const connectGraphToolbar = connect('GraphToolbar', (c) => {
  const graphService = c.service(GraphService);
  return view(
    {
      canUndo: graphService.canUndo,
      canRedo: graphService.canRedo,
      settled: graphService.settled,
      peerCount: graphService.peerCount
    },
    { undo: graphService.undo, redo: graphService.redo }
  );
});

/** The stage toolbar's undo/redo pair plus the simulation's settle readout. */
export function GraphToolbar() {
  const state = connectGraphToolbar({});
  return (
    <span use:componentRoot class={styles.controls}>
      <Button
        class={styles.iconButton}
        title="Undo (mod+z)"
        data-testid="graph-undo"
        disabled={!state.canUndo}
        onClick={state.undo}
      >
        <Undo2 size={14} />
      </Button>
      <Button
        class={styles.iconButton}
        title="Redo (mod+shift+z)"
        data-testid="graph-redo"
        disabled={!state.canRedo}
        onClick={state.redo}
      >
        <Redo2 size={14} />
      </Button>
      <span class={styles.simState} data-testid="graph-sim-state">
        {state.settled ? 'settled' : 'simulating'}
      </span>
      <span class={styles.simState} data-testid="graph-peer-count" data-count={state.peerCount}>
        {state.peerCount === 1 ? '1 peer' : `${state.peerCount} peers`}
      </span>
    </span>
  );
}
