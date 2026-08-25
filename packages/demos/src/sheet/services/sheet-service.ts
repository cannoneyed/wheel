/**
 * The sheet feature service: the ONLY place this demo touches synced data.
 * `cellAt` and `columnSum` are `computedFor` — one memoized node per
 * coordinate tuple (96 cells + 8 sums), each kept live until the service
 * disposes (no eviction).
 */
import { SyncService, type Infer } from 'wheel/sync';
import {
  cellList,
  clearColumn,
  setCell,
  type CellRow
} from '../sync/sheet.sync';

export type Cell = Infer<typeof CellRow>;

/** Spreadsheet letter for a 1-based column index (1 → 'A'). */
export const columnLabel = (col: number): string => String.fromCharCode(64 + col);

/** Owns the cell subscription and the one upsert-or-clear mutation. */
export class SheetService extends SyncService {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'SheetService';

  /** The cell subscription — read `list.rows` / `list.status` directly. */
  readonly list = this.liveQuery(cellList, {});

  /** Grid dimensions — fixed for the demo (rows 1..12, cols 1..8 = A..H). */
  readonly rowCount = 12;
  readonly colCount = 8;

  /** Value at (row, col); '' for empty cells. One memo per coordinate. */
  readonly cellAt = this.computedFor((row: number, col: number): string => {
    const cell = this.list.rows.find((c) => c.row === row && c.col === col);
    return cell?.value ?? '';
  });

  /** Sum of the numeric values in one column; non-numeric cells are ignored. */
  readonly columnSum = this.computedFor((col: number): number => {
    let sum = 0;
    for (const cell of this.list.rows) {
      if (cell.col !== col || cell.value.trim() === '') continue;
      const numeric = Number(cell.value);
      if (Number.isFinite(numeric)) {
        sum += numeric;
      }
    }
    return sum;
  });

  /** How many populated cells one column holds — the confirm dialog's "N cells". */
  readonly columnCellCount = this.computedFor((col: number): number => {
    return this.list.rows.filter((cell) => cell.col === col && cell.value !== '').length;
  });

  readonly set = (row: number, col: number, value: string) =>
    this.mutate(setCell, { row, col, value: value.trim() });

  /** Clear one column in one transaction and one undo step. */
  readonly clearColumn = (col: number) => this.mutate(clearColumn, { col });
}
