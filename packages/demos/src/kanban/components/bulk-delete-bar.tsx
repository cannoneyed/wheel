/**
 * The bulk-delete button in the toolbar row: ALWAYS mounted, disabled while
 * nothing is selected (the toolbar's no-layout-shift rule — presence is
 * constant, only enablement changes). Routes through
 * BoardService.deleteSelection (confirm dialog → removeMany → clear
 * selection) — the same flow the Backspace shortcut and the palette command
 * run.
 */
import { Show } from 'solid-js';
import Trash2 from 'lucide-solid/icons/trash-2';
import { componentRoot, connect, view } from 'wheel/core';

import { BoardService } from '../services/board-service';
import { SelectionService } from '../services/selection-service';
import styles from './bulk-delete-bar.module.css';

const connectBulkDeleteBar = connect('BulkDeleteBar', (c) => {
  const selectionService = c.service(SelectionService);
  const boardService = c.service(BoardService);
  return view(
    { count: selectionService.count },
    { deleteSelection: boardService.deleteSelection }
  );
});

/** Trash icon + selected count — disabled until cards are selected. */
export function BulkDeleteBar() {
  const state = connectBulkDeleteBar({});
  return (
    <button
      use:componentRoot
      class={styles.danger}
      title="Delete selected cards (Backspace)"
      disabled={state.count === 0}
      onClick={() => void state.deleteSelection()}
    >
      <Trash2 size={14} />
      <Show when={state.count > 0}>
        <span>{state.count}</span>
      </Show>
    </button>
  );
}
