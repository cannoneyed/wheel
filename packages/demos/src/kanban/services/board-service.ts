/**
 * The kanban feature service: the ONLY place this demo touches synced data.
 * Owns the card subscription, every card mutation, the tag filter, and the
 * the card actions its context menu composes. Columns are static layout data, not rows.
 *
 * The constructor is also the demo's contribution site: keyboard shortcuts
 * (Escape clears the selection, Backspace bulk-deletes through the confirm
 * dialog) and the command-palette commands, each paired with addCleanup so
 * they unregister when the context is disposed.
 */
import { type ServiceContext } from 'wheel/core';
import { SyncService, positionBetween, type Infer } from 'wheel/sync';
import { CommandPaletteService, DialogService, KeyboardService } from 'wheel/kit';
import { addCard, cardList, deleteCard, deleteCards, moveCard, type CardRow } from '../sync/kanban.sync';
import { SelectionService } from './selection-service';

export type Card = Infer<typeof CardRow>;

/** One static board column (layout data — deliberately not a synced table). */
export interface Column {
  readonly id: string;
  readonly title: string;
}

const COLUMNS: readonly Column[] = [
  { id: 'todo', title: 'To do' },
  { id: 'doing', title: 'Doing' },
  { id: 'done', title: 'Done' }
];

/** Owns the board subscription, card mutations, and the tag filter. */
export class BoardService extends SyncService {
  /** The card subscription — read `list.rows` / `list.status` directly. */
  readonly list = this.liveQuery(cardList, {});
  /** The active tag filter (null = show every card). Read `tagFilter.get()`. */
  readonly tagFilter = this.atom<string | null>(null, 'tagFilter');
  private readonly selectionService = this.service(SelectionService);
  private readonly dialogService = this.service(DialogService);

  constructor(context: ServiceContext) {
    super(context);
    const keyboardService = this.service(KeyboardService);
    const paletteService = this.service(CommandPaletteService);
    // Both gates are reactive `when` predicates: the bindings/commands exist
    // permanently but only fire (and only show in the palette) while true.
    const hasSelection = () => this.selectionService.count() > 0;
    // While a dialog is open (e.g. the bulk-delete confirm), Escape belongs
    // to the dialog and Backspace must not re-enter the confirm flow.
    const noDialog = () => this.dialogService.openId.get() === null;
    this.addCleanup(
      keyboardService.register({
        id: 'kanban.clearSelection',
        key: 'escape',
        when: () => hasSelection() && noDialog(),
        run: () => this.selectionService.clear()
      })
    );
    this.addCleanup(
      keyboardService.register({
        id: 'kanban.deleteSelection',
        key: 'backspace',
        when: () => hasSelection() && noDialog(),
        run: () => void this.deleteSelection()
      })
    );
    this.addCleanup(
      paletteService.registerCommand({
        id: 'board.clearSelection',
        title: 'Clear selection',
        keywords: ['deselect', 'cards'],
        when: hasSelection,
        run: () => this.selectionService.clear()
      })
    );
    this.addCleanup(
      paletteService.registerCommand({
        id: 'board.deleteSelection',
        title: 'Delete selected cards…',
        keywords: ['remove', 'bulk'],
        when: hasSelection,
        run: () => void this.deleteSelection()
      })
    );
    this.addCleanup(
      paletteService.registerCommand({
        id: 'board.filterBugs',
        title: 'Show only bug cards',
        keywords: ['filter', 'tag'],
        when: () => this.tags().includes('bug'),
        run: () => this.setTag('bug')
      })
    );
    this.addCleanup(
      paletteService.registerCommand({
        id: 'board.clearFilter',
        title: 'Clear tag filter',
        keywords: ['tags', 'show all'],
        when: () => this.tagFilter.get() !== null,
        run: () => this.setTag(null)
      })
    );
  }

  /** The static board columns, in board order. */
  readonly columns = this.computed((): readonly Column[] => COLUMNS);
  /** Distinct card tags, sorted — the filter bar's option list. */
  readonly tags = this.computed(
    (): readonly string[] => [...new Set(this.list.rows.map((card) => card.tag))].sort()
  );
  /** Every card in a column, unfiltered — positioning math needs the true tail. */
  private readonly allIn = this.computedFor(
    (columnId: string): readonly Card[] => this.list.rows.filter((card) => card.columnId === columnId)
  );
  /** The visible cards in a column: position-sorted, tag-filtered. */
  readonly cardsIn = this.computedFor((columnId: string): readonly Card[] => {
    const tag = this.tagFilter.get();
    const inColumn = this.allIn(columnId);
    return tag === null ? inColumn : inColumn.filter((card) => card.tag === tag);
  });
  /** The columns adjacent to `columnId` — drives the ◀ ▶ move buttons. */
  readonly neighbors = this.computedFor(
    (columnId: string): { left: Column | null; right: Column | null } => {
      const index = COLUMNS.findIndex((column) => column.id === columnId);
      return { left: COLUMNS[index - 1] ?? null, right: COLUMNS[index + 1] ?? null };
    }
  );

  readonly setTag = this.action((tag: string | null) => this.tagFilter.set(tag), 'setTag');
  readonly add = (columnId: string, title: string, tag: string) =>
    this.mutate(addCard, { columnId, title, tag });
  /** Move a card between two (optional) siblings in the target column. */
  readonly move = (cardId: string, columnId: string, beforeCard?: Card, afterCard?: Card) =>
    this.mutate(moveCard, {
      cardId,
      columnId,
      position: positionBetween(beforeCard?.position, afterCard?.position)
    });
  /** Move a card to the tail of a column (the ◀ ▶ / context-menu path). */
  readonly moveToEnd = (cardId: string, columnId: string) => {
    const tail = this.allIn(columnId)
      .filter((card) => card.id !== cardId)
      .at(-1);
    return this.move(cardId, columnId, tail, undefined);
  };
  readonly remove = (cardId: string) => this.mutate(deleteCard, { cardId });
  readonly removeMany = (cardIds: readonly string[]) =>
    this.mutate(deleteCards, { cardIds: [...cardIds] });
  /**
   * The bulk-delete flow (button, Backspace, palette command all land here):
   * confirm dialog → removeMany → clear selection. No-op with no selection
   * or when the user cancels.
   */
  readonly deleteSelection = async (): Promise<void> => {
    const ids = this.selectionService.ids();
    if (ids.length === 0) return;
    const confirmed = await this.dialogService.confirm(
      `Delete ${ids.length} selected card${ids.length === 1 ? '' : 's'}?`,
      { danger: true, confirmLabel: 'Delete' }
    );
    if (!confirmed) return;
    this.removeMany(ids);
    this.selectionService.clear();
  };
}
