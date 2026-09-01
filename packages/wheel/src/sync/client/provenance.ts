/**
 * Provenance: every client-side write carries a cause, kept in a capped ring
 * buffer — retention is bounded so a long-lived tab can't grow the log without
 * limit. This is the data `explain()` answers from.
 */

export type WriteCause =
  | { kind: 'bootstrap'; seq: number; subscriptionId: string }
  | { kind: 'sync-apply'; seq: number; subscriptionId: string }
  | { kind: 'optimistic'; mutationId: string; mutations: readonly string[] }
  | { kind: 'rollback'; mutationId: string; mutations: readonly string[] }
  | { kind: 'orphaned'; mutationId: string; mutations: readonly string[] }
  /** Served from the persisted local cache at boot, before any wire confirmation. */
  | { kind: 'hydrate'; seq: number };

/** One write in the audit log: collection/row, the value after the write, and its cause. */
export interface ProvenanceEntry {
  readonly at: number;
  readonly collection: string;
  readonly rowId: string;
  /** The row value after this write; undefined = the write deleted the row. */
  readonly value: Record<string, unknown> | undefined;
  readonly cause: WriteCause;
}

/** The capped ring buffer of writes that explain() answers from - bounded retention, oldest entries drop first. */
export class ProvenanceLog {
  private entries: ProvenanceEntry[] = [];

  constructor(private readonly capacity = 5_000) {}

  /** Append one write to the ring buffer (oldest entries drop past capacity). */
  record(entry: ProvenanceEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      // Once at capacity, every record reallocates: slice keeps the newest
      // `capacity` entries, dropping exactly one — an O(capacity) copy per
      // record. Cheap at this size; a real ring would only matter if
      // capacity grew by orders of magnitude.
      this.entries = this.entries.slice(this.entries.length - this.capacity);
    }
  }

  /** Every recorded write for one row, oldest first. */
  forRow(collection: string, rowId: string): ProvenanceEntry[] {
    return this.entries.filter((entry) => entry.collection === collection && entry.rowId === rowId);
  }

  /** The whole buffer, oldest first. */
  all(): readonly ProvenanceEntry[] {
    return this.entries;
  }
}
