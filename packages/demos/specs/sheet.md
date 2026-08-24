# Sheet — behavior spec

The spreadsheet demo: a 12×8 grid (rows 1–12, columns A–H) of individually
connected cells, a keyboard cursor (click / arrows / Enter), inline editing
that commits on Enter or blur and cancels on Escape, a live Σ footer summing
each column's numeric cells, and a per-cell context menu that clears one cell
or a whole column (behind a confirm). Ids are permanent: never renumber, never
reuse; retire a row with ~~strikethrough~~, keep it in place.

| id | behavior | notes |
|---|---|---|
| SHEET-01 | The grid renders 12 rows × 8 columns (A–H), the Σ footer, and the seeded cells, connected | smoke |
| SHEET-02 | A1 is selected on load, and exactly one cell is ever selected — clicking another cell moves the cursor | |
| SHEET-03 | Clicking a cell selects it and opens its editor; only one editor is open at a time | |
| SHEET-04 | Typing a value and pressing Enter commits it, and the value survives the server confirm | insert path (empty cell → new row) |
| SHEET-05 | Escape cancels the edit: the previous value stays and nothing is sent | |
| SHEET-06 | Clicking another cell while editing commits the draft (blur commits) and starts editing the cell clicked | |
| SHEET-07 | Committing an empty value clears the cell | empty value deletes the row |
| SHEET-08 | Committed values are trimmed | `"  x  "` lands as `x` |
| SHEET-09 | Re-committing the value a cell already has sends no mutation | equality guard in the cell's commit |
| SHEET-10 | Arrow keys move the selection one cell in each direction while the grid has focus | Escape hands focus back to the grid |
| SHEET-11 | Arrow keys clamp at the grid edges — A1 cannot move up or left, H12 cannot move down or right | |
| SHEET-12 | Enter on the selected cell opens its editor, so a value can be entered without the mouse | |
| SHEET-13 | Arrow keys inside an open editor move the caret and never the selection | KeyboardService skips editable targets |
| SHEET-14 | After an Enter commit the grid has focus again, so the arrow keys keep moving the selection | |
| SHEET-15 | The Σ footer sums a column's numeric cells and updates as cells commit and clear | |
| SHEET-16 | Non-numeric cells are ignored by the Σ sum | |
| SHEET-17 | The Σ sum rounds to two decimals | `0.1 + 0.2` shows `0.3` |
| SHEET-18 | Right-clicking a cell opens its menu with "Clear cell" and "Clear column <letter>" | letter comes from the clicked column |
| SHEET-19 | "Clear cell" empties that one cell and closes the menu | |
| SHEET-20 | "Clear column" confirms with the column's letter and populated-cell count, then clears the whole column (Σ → 0) | one mutation, one undo step |
| SHEET-21 | Cancelling the clear-column confirm leaves every cell and the Σ sum intact | |
| SHEET-22 | Overwriting a populated cell survives the confirm and does not duplicate the row | update path; a duplicate row would double-count in Σ |
| SHEET-23 | "Clear cell" on an already-empty cell is a harmless no-op | keeps the minted-id stream aligned on both sides |

## Not covered here (and why)

- **Undo / redo.** The clear-column mutation has a real inverse (restore the
  exact rows), but this demo mounts no undo UI and registers no undo shortcut,
  so a browser test has nothing to click. Covered by `src/sheet/sheet.test.ts`
  ("clear column is one mutation and one undo/redo step").
- **Two-window convergence and reload persistence.** The embedded host runs a
  private sync engine per page load (WASM SQLite in a worker), so a second tab
  or a reload starts from a fresh seeded world. A behavior must hold on both
  hosts, so cross-window convergence stays in the vitest suite, which drives
  two real clients against one engine.
- **The "loading…" note.** It renders only while the first subscription is in
  flight; on both hosts that window is a race with no deterministic hook.
- **Offline / queued mutations.** The sheet's header exposes latency only —
  there is no offline toggle to drive from a test.
- **Command palette.** This demo does not mount `CommandPaletteSystem`; the
  palette is the kanban demo's showcase (KANBAN-13, KANBAN-14).
