/**
 * The grid cursor: which cell is selected and which is being edited.
 * Ephemeral UI state, never synced — a plain Service. The arrow/Enter
 * shortcuts live HERE (registered in the constructor, torn down via
 * addCleanup), scoped to the 'sheet' focus scope so they only fire while
 * the grid has focus. Escape-while-editing is NOT registered: the edit
 * input handles its own Enter/Escape/blur, and KeyboardService skips
 * editable targets by default — nothing double-fires.
 */
import { Service, type ServiceContext } from 'wheel/core';
import { KeyboardService } from 'wheel/kit';

import { SheetService } from './sheet-service';

/** The focus scope the grid declares with `use:focusScope` — shortcut home. */
export const SHEET_FOCUS_SCOPE = 'sheet';

/** A 1-based grid coordinate, matching SheetService.cellAt. */
export interface CellAddress {
  readonly row: number;
  readonly col: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Owns the selected/editing cell and the grid's keyboard bindings. */
export class SelectionService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'SelectionService';

  private readonly sheetService = this.service(SheetService);
  /** The selected cell — always inside the grid (moves are clamped). Connect directly. */
  readonly selected = this.atom<CellAddress>({ row: 1, col: 1 }, 'selected');
  private readonly editingCell = this.atom<CellAddress | null>(null, 'editing');

  /** Whether (row, col) is the selected cell — one memo per coordinate. */
  readonly isSelected = this.computedFor((row: number, col: number): boolean => {
    const cell = this.selected.get();
    return cell.row === row && cell.col === col;
  }, 'isSelected');

  /** Whether (row, col) is being edited — one memo per coordinate. */
  readonly isEditing = this.computedFor((row: number, col: number): boolean => {
    const cell = this.editingCell.get();
    return cell !== null && cell.row === row && cell.col === col;
  }, 'isEditing');

  /** Select a cell directly (clicking a cell routes through this). */
  readonly select = this.action((row: number, col: number) => {
    this.selected.set({ row, col });
  }, 'select');

  /** Move the selection by a row/col delta, clamped to the grid edges. */
  readonly move = this.action((rowDelta: number, colDelta: number) => {
    const { row, col } = this.selected.get();
    this.selected.set({
      row: clamp(row + rowDelta, 1, this.sheetService.rowCount),
      col: clamp(col + colDelta, 1, this.sheetService.colCount)
    });
  }, 'move');

  /** Begin editing the selected cell (Enter, or clicking a cell). */
  readonly startEdit = this.action(() => {
    this.editingCell.set(this.selected.get());
  }, 'startEdit');

  /** Stop editing — both commit and cancel end here. Idempotent. */
  readonly endEdit = this.action(() => this.editingCell.set(null), 'endEdit');

  constructor(context: ServiceContext) {
    super(context);
    const keyboardService = this.service(KeyboardService);
    const scope = SHEET_FOCUS_SCOPE;
    this.addCleanup(keyboardService.register({ id: 'sheet.moveUp', key: 'arrowup', scope, run: () => this.move(-1, 0) }));
    this.addCleanup(keyboardService.register({ id: 'sheet.moveDown', key: 'arrowdown', scope, run: () => this.move(1, 0) }));
    this.addCleanup(keyboardService.register({ id: 'sheet.moveLeft', key: 'arrowleft', scope, run: () => this.move(0, -1) }));
    this.addCleanup(keyboardService.register({ id: 'sheet.moveRight', key: 'arrowright', scope, run: () => this.move(0, 1) }));
    this.addCleanup(keyboardService.register({ id: 'sheet.startEdit', key: 'enter', scope, run: () => this.startEdit() }));
  }
}
