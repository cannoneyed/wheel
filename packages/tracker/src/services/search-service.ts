/**
 * Live search: a debounced query atom feeding per-query-string
 * subscriptions. Results stay LIVE while the overlay is open — a matching
 * issue edited elsewhere re-ranks in place.
 *
 * Known cost: liveQueryFor retains one subscription
 * per distinct debounced query string until service destroy. Fine for a demo
 * session; a release policy is the queued kernel follow-up.
 */
import { SyncService } from 'wheel/sync';
import { searchQuery, type SearchResult } from '../sync/search.sync';

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

/** Owns the search overlay state and the live results subscription. */
export class SearchService extends SyncService {
  private readonly view = this.liveQueryFor(searchQuery, (q: string) => ({ q }));
  /** Whether the search overlay is open. Connect directly. */
  readonly isOpen = this.atom<boolean>(false, 'isOpen');
  /** The raw input text (what the box shows). Connect directly. */
  readonly query = this.atom<string>('', 'query');
  private readonly effective = this.atom<string>('', 'effectiveQuery');
  private readonly cancelDebounce = this.field<(() => void) | undefined>(undefined);

  /** Live results for the debounced query (empty under the minimum length). */
  readonly results = this.computed((): readonly SearchResult[] => {
    const q = this.effective.get();
    if (q.length < MIN_QUERY) return [];
    return this.view(q).rows;
  }, 'results');

  /** Open the overlay (fresh input). */
  readonly open = this.action(() => {
    this.query.set('');
    this.effective.set('');
    this.isOpen.set(true);
  }, 'open');

  /** Close the overlay. */
  readonly close = this.action(() => {
    this.cancelDebounce.get()?.();
    this.cancelDebounce.set(undefined);
    this.isOpen.set(false);
  }, 'close');

  /** Update the input; the subscription follows after a debounce beat. */
  readonly setQuery = this.action((text: string) => {
    this.query.set(text);
    this.cancelDebounce.get()?.();
    this.cancelDebounce.set(this.defer(DEBOUNCE_MS, () => {
      this.cancelDebounce.set(undefined);
      this.effective.set(text.trim());
    }));
  }, 'setQuery');

  protected override onDestroy(): void {
    this.cancelDebounce.get()?.();
    this.cancelDebounce.set(undefined);
  }
}
