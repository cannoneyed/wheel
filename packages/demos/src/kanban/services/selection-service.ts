/**
 * Local multi-select state for bulk actions. Ephemeral UI state, never
 * synced — a plain Service, not a SyncService. The Set is replaced through
 * immer drafts (atom.update), never mutated in place.
 */
import { Service } from 'wheel/core';

/** Owns the selected-card set for bulk delete. */
export class SelectionService extends Service {
  private readonly selected = this.atom<Set<string>>(new Set(), 'selected');

  /** Whether one card is currently selected. */
  readonly isSelected = this.computedFor((cardId: string) => this.selected.get().has(cardId));
  /** How many cards are selected — drives the bulk-delete button. */
  readonly count = this.computed(() => this.selected.get().size);
  /** The selected ids as an array (the bulk-delete input). */
  readonly ids = this.computed((): readonly string[] => [...this.selected.get()]);

  readonly toggle = this.action((cardId: string) => {
    this.selected.update((draft) => {
      if (draft.has(cardId)) {
        draft.delete(cardId);
      } else {
        draft.add(cardId);
      }
    });
  }, 'toggle');
  readonly clear = this.action(() => this.selected.set(new Set()), 'clear');
}
