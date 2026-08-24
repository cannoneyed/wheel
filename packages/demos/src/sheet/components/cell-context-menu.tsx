/**
 * The cell's context menu — an ORDINARY connected component ("globally
 * rendered, locally connected"): declared at the cell, portaled by
 * ContextMenuSystem, fully aware of global services, locally fed by props.
 * Per-instance connect name so each open menu is auditable in the registry.
 * "Clear column" routes through the confirm dialog before mutating.
 */
import { componentRoot, connect, view } from 'wheel/core';
import { ContextMenuService, DialogService } from 'wheel/kit';

import { SheetService, columnLabel } from '../services/sheet-service';
import styles from './sheet.module.css';

const connectCellContextMenu = connect(
  (props: { row: number; col: number }) => `contextMenu:cell:r${props.row}c${props.col}`,
  (c, props) => {
    const sheetService = c.service(SheetService);
    const contextMenuService = c.service(ContextMenuService);
    const dialogService = c.service(DialogService);
    return view(
      {
        columnCellCount: () => sheetService.columnCellCount(props.col)
      },
      {
        clearCell: () => sheetService.set(props.row, props.col, ''),
        clearColumn: () => sheetService.clearColumn(props.col),
        confirmClearColumn: (count: number) =>
          dialogService.confirm(`Clear column ${columnLabel(props.col)}? (${count} cells)`, {
            danger: true,
            confirmLabel: 'Clear'
          }),
        close: contextMenuService.close
      }
    );
  }
);

/** Menu content for one cell: clear the cell, or clear its whole column. */
export function CellContextMenu(props: { row: number; col: number }) {
  const state = connectCellContextMenu(props);
  const requestClearColumn = async () => {
    const count = state.columnCellCount;
    state.close();
    const confirmed = await state.confirmClearColumn(count);
    if (confirmed) state.clearColumn();
  };
  return (
    <div use:componentRoot class={styles.menu}>
      <button
        class={styles.menuItem}
        onClick={() => {
          state.clearCell();
          state.close();
        }}
      >
        Clear cell
      </button>
      <button class={styles.menuItem} onClick={() => void requestClearColumn()}>
        Clear column {columnLabel(props.col)}
      </button>
    </div>
  );
}
