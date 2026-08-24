/**
 * One cell of the grid. The synced value comes from SheetService (cellAt —
 * one memo per coordinate); selection/editing state comes from
 * SelectionService. The in-progress draft is ephemeral, component-bound
 * state: a plain signal is the sanctioned tool here, not a service
 * (null = untouched since the edit began, so the input shows the live value).
 * The input owns its Enter/Escape/blur handling — KeyboardService skips
 * editable targets by default, so the grid shortcuts never double-fire.
 */
import { Show } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';
import { FocusService, contextMenu } from 'wheel/kit';

import { SheetService } from '../services/sheet-service';
import { SHEET_FOCUS_SCOPE, SelectionService } from '../services/selection-service';
import { CellContextMenu } from './cell-context-menu';
import styles from './sheet.module.css';

const connectEditableCell = connect('EditableCell', (c, props: { row: number; col: number }) => {
  const sheetService = c.service(SheetService);
  const selectionService = c.service(SelectionService);
  const focusService = c.service(FocusService);
  return view(
    {
      value: () => sheetService.cellAt(props.row, props.col),
      selected: () => selectionService.isSelected(props.row, props.col),
      editing: () => selectionService.isEditing(props.row, props.col)
    },
    {
      set: sheetService.set,
      select: selectionService.select,
      startEdit: selectionService.startEdit,
      endEdit: selectionService.endEdit,
      // Keyboard exits hand focus back to the grid so arrows keep working.
      refocusGrid: () => focusService.focus(SHEET_FOCUS_SCOPE)
    }
  );
});

/** A selectable, editable cell with its own context menu. */
export function EditableCell(props: { row: number; col: number }) {
  const state = connectEditableCell(props);
  const [draft, setDraft] = useSignal<string | null>(null, 'draft');
  const beginEdit = () => {
    setDraft(null);
    state.select(props.row, props.col);
    state.startEdit();
  };
  const commit = (viaKeyboard: boolean) => {
    const text = draft();
    setDraft(null);
    // Guarded: when the user mousedowns ANOTHER cell, that cell begins editing
    // BEFORE this input's blur commits — the global editing cursor already
    // moved on, and clearing it here would tear down the new cell's editor.
    if (state.editing) {
      state.endEdit();
    }
    if (text !== null && text.trim() !== state.value) {
      state.set(props.row, props.col, text);
    }
    if (viaKeyboard) state.refocusGrid();
  };
  const cancel = () => {
    setDraft(null);
    state.endEdit();
    state.refocusGrid();
  };
  return (
    <td
      use:componentRoot
      class={state.selected ? `${styles.cell} ${styles.cellSelected}` : styles.cell}
      // mousedown, not click: it fires BEFORE the previous editor's blur, so
      // committing that editor (which re-renders its cell — instantly on the
      // in-browser engine) can never swallow the interaction that follows it.
      // preventDefault: the handler swaps the span for the input, so the
      // browser's default focus action would run against a detached target
      // and dump focus to <body>, blurring the editor it just opened. Skipped
      // while already editing so caret placement inside the input stays native.
      onMouseDown={(event) => {
        if (state.editing) return;
        event.preventDefault();
        beginEdit();
      }}
      use:contextMenu={{
        id: `cell:r${props.row}c${props.col}`,
        menu: () => <CellContextMenu row={props.row} col={props.col} />
      }}
    >
      <Show
        when={state.editing}
        fallback={<span class={styles.cellValue}>{state.value}</span>}
      >
        <input
          type="text"
          class={styles.cellInput}
          value={draft() ?? state.value}
          ref={(el) => queueMicrotask(() => el.focus())}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onBlur={() => commit(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(true);
            if (e.key === 'Escape') cancel();
          }}
        />
      </Show>
    </td>
  );
}
