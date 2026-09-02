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

/**
 * The mutation names a cause carries, or `[]` for the causes that carry none.
 *
 * THE ONLY PLACE that reads a cause's payload. Every surface that shows a
 * cause — the annotator's timeline, the tracker's provenance receipt, the
 * debug panel's change stream — asks here instead of destructuring `WriteCause`
 * itself, and that is the whole point:
 *
 * - the union's shape is read in ONE site, so renaming a field breaks the
 *   build once, loudly, instead of leaving every consumer silently taking a
 *   fallback branch (which is exactly what the 0.1 → 0.2 rename of `mutation`
 *   to `mutations` did to two of them);
 * - the `never` in the default arm makes ADDING a cause kind a compile error
 *   here, so a new kind cannot quietly go unnamed everywhere at once.
 *
 * A convention about how to narrow would be an opinion. This is the same
 * guarantee as machinery: consumers cannot get it wrong, because they are not
 * the ones doing it.
 */
export function causeMutations(cause: WriteCause): readonly string[] {
  switch (cause.kind) {
    case 'optimistic':
    case 'rollback':
    case 'orphaned':
      return cause.mutations;
    case 'bootstrap':
    case 'sync-apply':
    case 'hydrate':
      return [];
    default: {
      // Unreachable while the switch is exhaustive; a new kind fails here.
      const unhandled: never = cause;
      return unhandled;
    }
  }
}

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
