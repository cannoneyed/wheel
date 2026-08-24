/**
 * Graph demo — the bridge to imperative rendering. A collaborative
 * force-directed package graph on a three.js canvas, wrapped by wheel.
 *
 * The one paragraph worth remembering: NODES AND EDGES SYNC, POSITIONS DO
 * NOT. Every client runs the same seeded simulation over the same rows and
 * arrives at the same picture without a single coordinate crossing the wire.
 * Drag a node and its live position rides the PRESENCE channel — peers watch
 * it move, the database never hears about it. Let go, and exactly one
 * invertible `nodes.pin` mutation records where you dropped it. Undo puts it
 * back where it was.
 *
 * Open two windows: peer cursors and "who is dragging what" appear in the
 * scene, and the debug panel shows the same graph as named rows next to the
 * moving pixels.
 */
import { viewRoot } from 'wheel/core';
import { ContextMenuSystem, DialogSystem, KeyboardSystem } from 'wheel/kit';
import { WheelApp } from 'wheel/debug';

import { demoClient } from '../shared/utils/demo-client';
import { DemoStage } from '../shared/components/demo-stage';
import { GraphCanvas } from './components/graph-canvas';
import { GraphSidebar } from './components/graph-sidebar';
import { GraphToolbar } from './components/graph-toolbar';
import styles from './graph.module.css';

/** The demo root the shell mounts. */
export function GraphDemo() {
  return (
    <WheelApp client={demoClient('graph')}>
      <DemoStage title="Graph" toolbar={<GraphToolbar />}>
        <div use:viewRoot={'GraphDemo'} class={styles.layout}>
          <GraphCanvas />
          <GraphSidebar />
        </div>
      </DemoStage>
      <KeyboardSystem />
      <ContextMenuSystem />
      <DialogSystem />
    </WheelApp>
  );
}
