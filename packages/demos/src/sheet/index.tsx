/**
 * Spreadsheet demo — 12×8 live grid. Every cell is its own connected
 * component reading `cellAt(row, col)`, and the footer reads `columnSum(col)`:
 * the computed-with-args LRU (one memo per coordinate tuple) doing real work.
 * Open the demo in two windows and type into a cell — edits and sums converge.
 *
 * Composition only: the grid plus the global surfaces (keyboard dispatch,
 * dialogs, context menus, debug panel). Each connected component lives in
 * its own file (sheet-grid / editable-cell / column-sum / cell-context-menu).
 */
import { ContextMenuSystem, DialogSystem, KeyboardSystem } from 'wheel/kit';
import { WheelApp } from 'wheel/debug';
import { WheelAnnotate } from 'wheel/annotate';

import { demoClient } from '../shared/utils/demo-client';
import { DemoStage } from '../shared/components/demo-stage';
import { SheetGrid } from './components/sheet-grid';

/** The demo root the shell mounts. */
export function SheetDemo() {
  return (
    <WheelApp client={demoClient('sheet')}>
      <DemoStage title="Spreadsheet">
        <SheetGrid />
      </DemoStage>
      <KeyboardSystem />
      <DialogSystem />
      <ContextMenuSystem />
      <WheelAnnotate />
    </WheelApp>
  );
}
