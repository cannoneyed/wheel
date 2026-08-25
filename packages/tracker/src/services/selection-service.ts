/**
 * Selection + keyboard cursor for issue views. Plain (non-live)
 * service: in split view each pane's scope gets its own instance via
 * `inheritServices: 'live'`.
 *
 * The cursor is the keyboard focus row; the selection is the checked set.
 * Range semantics follow Linear: `shift+↓/↑` extends from the anchor, `x`
 * toggles and re-anchors.
 */
import { Service } from 'wheel/core';

/** Owns the cursor row, the selected set, and the range anchor. */
export class SelectionService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'SelectionService';

  /** The keyboard cursor row id (or null before first navigation). Connect directly. */
  readonly cursor = this.atom<string | null>(null, 'cursor');
  private readonly selected = this.atom<ReadonlySet<string>>(new Set(), 'selected');
  private readonly anchorId = this.atom<string | null>(null, 'anchor');

  /** Whether an issue is in the selected set. */
  readonly isSelected = this.computedFor((issueId: string) => this.selected.get().has(issueId), 'isSelected');
  /** Selected ids in insertion order. */
  readonly ids = this.computed((): readonly string[] => [...this.selected.get()], 'ids');
  /** Selected count. */
  readonly count = this.computed(() => this.selected.get().size, 'count');
  /** Whether anything is selected. */
  readonly hasSelection = this.computed(() => this.selected.get().size > 0, 'hasSelection');

  /** Place the cursor (and the range anchor) on a row. */
  readonly setCursor = this.action((issueId: string | null) => {
    this.cursor.set(issueId);
    this.anchorId.set(issueId);
  }, 'setCursor');

  /** Move the cursor by delta through the visible order; clamps at the ends. */
  readonly moveCursor = this.action((orderedIds: readonly string[], delta: number) => {
    if (orderedIds.length === 0) return;
    const current = this.cursor.get();
    const index = current === null ? -1 : orderedIds.indexOf(current);
    const next =
      index === -1
        ? delta > 0
          ? 0
          : orderedIds.length - 1
        : Math.min(orderedIds.length - 1, Math.max(0, index + delta));
    this.setCursor(orderedIds[next]);
  }, 'moveCursor');

  /**
   * Move the cursor by delta AND select the whole anchor→cursor range
   * (Linear's shift+↓/↑). The anchor stays put.
   */
  readonly extendCursor = this.action((orderedIds: readonly string[], delta: number) => {
    if (orderedIds.length === 0) return;
    const current = this.cursor.get();
    const index = current === null ? -1 : orderedIds.indexOf(current);
    const next =
      index === -1 ? (delta > 0 ? 0 : orderedIds.length - 1) : Math.min(orderedIds.length - 1, Math.max(0, index + delta));
    this.cursor.set(orderedIds[next]);
    if (this.anchorId.get() === null) this.anchorId.set(orderedIds[next]);
    this.selectRangeTo(orderedIds, orderedIds[next]);
  }, 'extendCursor');

  /** Toggle one row's membership; re-anchors on it. */
  readonly toggle = this.action((issueId: string) => {
    this.selected.update((draft) => {
      if (draft.has(issueId)) draft.delete(issueId);
      else draft.add(issueId);
    });
    this.cursor.set(issueId);
    this.anchorId.set(issueId);
  }, 'toggle');

  /** Select the anchor→target range within the visible order (shift+click). */
  readonly selectRangeTo = this.action((orderedIds: readonly string[], issueId: string) => {
    const anchor = this.anchorId.get() ?? issueId;
    const from = orderedIds.indexOf(anchor);
    const to = orderedIds.indexOf(issueId);
    if (from === -1 || to === -1) return;
    const [start, end] = from <= to ? [from, to] : [to, from];
    this.selected.update((draft) => {
      draft.clear();
      for (const id of orderedIds.slice(start, end + 1)) draft.add(id);
    });
    this.cursor.set(issueId);
  }, 'selectRangeTo');

  /** Clear the selection (cursor and anchor stay). */
  readonly clear = this.action(() => {
    this.selected.set(new Set());
  }, 'clear');

  /** Drop rows that no longer exist from the selection/cursor (post-archive/delete). */
  readonly retain = this.action((existingIds: ReadonlySet<string>) => {
    this.selected.update((draft) => {
      for (const id of [...draft]) {
        if (!existingIds.has(id)) draft.delete(id);
      }
    });
    const cursor = this.cursor.get();
    if (cursor !== null && !existingIds.has(cursor)) this.cursor.set(null);
  }, 'retain');
}
