/**
 * Kanban demo — services + global surfaces on one board. Click a
 * card to select it (bulk delete goes through a confirm dialog), right-click
 * for the card's own context-menu component, ◀ ▶ to move a card between
 * columns with fractional positions. Escape clears the selection, Backspace
 * bulk-deletes it, and mod+k opens the command palette (this demo is the
 * palette showcase — BoardService contributes the commands). All of it
 * optimistic and offline-safe.
 *
 * This file is composition only: every connected component lives in its own
 * module.
 */
import { CommandPaletteSystem, ContextMenuSystem, DialogSystem, KeyboardSystem } from 'wheel/kit';
import { WheelApp } from 'wheel/debug';

import { demoClient } from '../shared/utils/demo-client';
import { DemoStage } from '../shared/components/demo-stage';
import { BulkDeleteBar } from './components/bulk-delete-bar';
import { FilterBar } from './components/filter-bar';
import { Board } from './components/board';

/** The demo root the shell mounts. */
export function KanbanDemo() {
  return (
    <WheelApp client={demoClient('kanban')}>
      <DemoStage title="Kanban" toolbar={<BulkDeleteBar />}>
        <FilterBar />
        <Board />
      </DemoStage>
      <ContextMenuSystem />
      <DialogSystem />
      <KeyboardSystem />
      <CommandPaletteSystem />
    </WheelApp>
  );
}
