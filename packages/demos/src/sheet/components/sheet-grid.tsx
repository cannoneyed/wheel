/**
 * The 12×8 grid: header row, editable cells, sums footer. Declares the
 * 'sheet' focus scope on its wrapper (`use:focusScope` stamps tabindex, so
 * clicking anywhere in the grid focuses it) — the arrow/Enter bindings
 * SelectionService registers are scoped there and only fire while the user
 * is working in the grid.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { focusScope } from 'wheel/kit';

import { SheetService, columnLabel } from '../services/sheet-service';
import { SHEET_FOCUS_SCOPE } from '../services/selection-service';
import { EditableCell } from './editable-cell';
import { ColumnSum } from './column-sum';
import styles from './sheet.module.css';

const range = (count: number): number[] => Array.from({ length: count }, (_, i) => i + 1);

const connectSheetGrid = connect('SheetGrid', (c) => {
  const sheetService = c.service(SheetService);
  return view({
    status: () => sheetService.list.status,
    rowCount: () => sheetService.rowCount,
    colCount: () => sheetService.colCount
  });
});

/** The whole spreadsheet surface: table + footer sums + usage hint. */
export function SheetGrid() {
  const state = connectSheetGrid({});
  return (
    <div use:componentRoot class={styles.grid} use:focusScope={{ id: SHEET_FOCUS_SCOPE }}>
      <Show when={state.status.kind === 'loading'}>
        <span class="stale-note">loading… (first boot with no cache and no server waits here)</span>
      </Show>
      <table class={styles.table}>
        <thead>
          <tr>
            <th class={styles.headerCell} />
            <For each={range(state.colCount)}>
              {(col) => <th class={styles.headerCell}>{columnLabel(col)}</th>}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={range(state.rowCount)}>
            {(row) => (
              <tr>
                <th class={styles.headerCell}>{row}</th>
                <For each={range(state.colCount)}>
                  {(col) => <EditableCell row={row} col={col} />}
                </For>
              </tr>
            )}
          </For>
        </tbody>
        <tfoot>
          <tr>
            <th class={styles.headerCell}>Σ</th>
            <For each={range(state.colCount)}>{(col) => <ColumnSum col={col} />}</For>
          </tr>
        </tfoot>
      </table>
      <p class={styles.note}>
        Click a cell (or press Enter) to edit — Enter/blur commits, Escape cancels, empty clears
        the cell. Arrow keys move the selection while the grid has focus; right-click a cell for
        clear actions. The Σ row sums each column's numeric cells, live.
      </p>
    </div>
  );
}
