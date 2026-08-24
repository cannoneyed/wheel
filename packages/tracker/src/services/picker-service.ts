/**
 * The property picker: one keyboard-first overlay (type-ahead + arrows +
 * enter) that every property menu shares — status, priority, assignee,
 * labels, estimate, and the filter menus.
 *
 * Doctrine (from DialogService): the ATOM holds only reactive display data;
 * the live handles — onPick and the reactive `selected` read — live in a
 * plain field outside reactive state.
 */
import { Service } from 'wheel/core';

/** One row in the picker list. */
export interface PickerOption {
  readonly id: string;
  readonly label: string;
  /** Short glyph rendered before the label (colored via `color`). */
  readonly icon?: string;
  readonly color?: string;
  /** Muted trailing text (e.g. a state's type). */
  readonly hint?: string;
}

/** What `open` takes. */
export interface PickerRequest {
  readonly title: string;
  readonly options: readonly PickerOption[];
  /** Reactive read of the currently applied ids (checkmarks live-update). */
  readonly selected: () => ReadonlySet<string>;
  /** Multi keeps the picker open across picks (label-style toggling). */
  readonly multi: boolean;
  readonly onPick: (id: string) => void;
}

/** Owns the open picker, its query, and the active row. */
export class PickerService extends Service {
  private readonly request = this.field<PickerRequest | null>(null);
  /** The open picker's title, or null. Connect directly. */
  readonly title = this.atom<string | null>(null, 'title');
  /** The type-ahead query. Connect directly. */
  readonly query = this.atom<string>('', 'query');
  private readonly activeIdx = this.atom<number>(0, 'activeIndex');

  /** Whether a picker is open. */
  readonly isOpen = this.computed(() => this.title.get() !== null, 'isOpen');
  /** Whether the open picker is multi-select. */
  readonly isMulti = this.computed(() => this.request.get()?.multi ?? false, 'isMulti');

  /** Options filtered by the query: prefix matches rank first, then includes. */
  readonly filtered = this.computed((): readonly PickerOption[] => {
    this.title.get();
    const options = this.request.get()?.options ?? [];
    const query = this.query.get().trim().toLowerCase();
    if (query === '') return options;
    const starts = options.filter((option) => option.label.toLowerCase().startsWith(query));
    const includes = options.filter(
      (option) => !option.label.toLowerCase().startsWith(query) && option.label.toLowerCase().includes(query)
    );
    return [...starts, ...includes];
  }, 'filtered');

  /** The keyboard-active row index into `filtered`. */
  readonly activeIndex = this.computed(
    () => Math.min(this.activeIdx.get(), Math.max(0, this.filtered().length - 1)),
    'activeIndex'
  );

  /** Whether an option id is currently applied (reactive checkmark read). */
  readonly isApplied = this.computedFor((id: string): boolean => {
    this.title.get();
    return this.request.get()?.selected().has(id) ?? false;
  }, 'isApplied');

  /** Open a picker (replaces any open one). */
  readonly open = this.action((request: PickerRequest) => {
    this.request.set(request);
    this.query.set('');
    this.activeIdx.set(0);
    this.title.set(request.title);
  }, 'open');

  /** Close the picker. */
  readonly close = this.action(() => {
    this.request.set(null);
    this.title.set(null);
  }, 'close');

  /** Update the type-ahead query (resets the active row). */
  readonly setQuery = this.action((query: string) => {
    this.query.set(query);
    this.activeIdx.set(0);
  }, 'setQuery');

  /** Move the keyboard-active row, clamped. */
  readonly moveActive = this.action((delta: number) => {
    const max = Math.max(0, this.filtered().length - 1);
    this.activeIdx.set(Math.min(max, Math.max(0, this.activeIndex() + delta)));
  }, 'moveActive');

  /** Pick an option: applies via onPick; single-select pickers close. */
  readonly pick = this.action((id: string) => {
    const request = this.request.get();
    if (!request) return;
    request.onPick(id);
    if (!request.multi) this.close();
  }, 'pick');

  /** Pick the keyboard-active option. */
  readonly pickActive = this.action(() => {
    const option = this.filtered()[this.activeIndex()];
    if (option) this.pick(option.id);
  }, 'pickActive');
}
