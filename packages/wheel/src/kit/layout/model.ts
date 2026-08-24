/** A track preference in the only two accepted spellings: `'240px'` or `'1fr'`. */
export type FrameSize = `${number}px` | `${number}fr`;

/** The three frame kinds; rows and columns split, drawers overlay. */
export type FrameKind = 'row' | 'column' | 'drawer';

/** Axis along which a split arranges its children. */
export type FrameAxis = 'row' | 'column';

/** Rounded content-box measurement reported by a mounted frame. */
export interface LayoutMeasurement {
  readonly inlineSize: number;
  readonly blockSize: number;
}

/** Everything a mounting frame component tells the service about itself. */
export interface FrameRegistrationInput {
  readonly id: string;
  readonly kind: FrameKind;
  /** Nearest ancestor frame, or null for a root. */
  readonly parentId: string | null;
  /** The parent's split axis; null for roots and drawers. */
  readonly parentAxis: FrameAxis | null;
  readonly size: FrameSize;
  /** Lower resize clamp in CSS pixels. */
  readonly minSize: number;
  /** Upper resize clamp in CSS pixels, or null for none. */
  readonly maxSize: number | null;
  /** Auto-collapse when the parent container is narrower than this. */
  readonly collapseBelow: number | null;
  readonly defaultOpen: boolean;
  /**
   * The overflow axis of this split, when it scrolls instead of fitting.
   * Children of a scrollable split resize solo: the dragged track changes
   * and the overflow — not the neighbor — absorbs the difference.
   */
  readonly scrollable: 'x' | 'y' | null;
}

/** The live geometry record for one mounted frame. */
export interface LayoutNode {
  readonly id: string;
  readonly kind: FrameKind;
  readonly parentId: string | null;
  readonly parentAxis: FrameAxis | null;
  /** The user's request; persisted and never changed by responsive collapse. */
  readonly open: boolean;
  /** The effective result: open and not collapsed by a container condition. */
  readonly visible: boolean;
  /** Current track preference. */
  readonly size: FrameSize;
  /** The preference declared in JSX; `reset` returns here. */
  readonly defaultSize: FrameSize;
  readonly minSize: number;
  readonly maxSize: number | null;
  readonly collapseBelow: number | null;
  /** Measured content box, or null before the first report. */
  readonly pixels: LayoutMeasurement | null;
  /** True while this frame is one side of an active resize draft. */
  readonly dragging: boolean;
  /** The overflow axis when this split scrolls instead of fitting. */
  readonly scrollable: 'x' | 'y' | null;
  /**
   * True while a scrollable split is locked to fit: its children hold
   * fractional weights, structure changes re-fit proportionally, and resizes
   * trade space instead of overflowing. Set by a snapped drag; cleared by
   * dragging the trailing handle off the edge. Persisted.
   */
  readonly fitLocked: boolean;
}

/** A resize transaction; drafts never enter persisted geometry. */
export interface LayoutResizeDraft {
  readonly kind: 'resize';
  readonly parentId: string;
  readonly parentAxis: FrameAxis;
  readonly beforeId: string;
  /** Null for a trailing handle in a scrollable split: there is no neighbor. */
  readonly afterId: string | null;
  readonly beforePx: number;
  readonly afterPx: number;
  readonly deltaPx: number;
  readonly minDelta: number;
  readonly maxDelta: number;
  /** True inside a scrollable split: only the dragged track changes. */
  readonly solo: boolean;
  /**
   * The pane whose trailing edge is currently snapped to the container's far
   * edge, or null. Committing a snapped draft locks the split to fit.
   */
  readonly snappedEdgeId: string | null;
  /**
   * The no-gap invariant for non-trailing solo drags. The row's LAST pane
   * renders at `max(basePx, attachPx - draggedPx)`: it never shrinks below
   * its starting width, and grows exactly as much as needed to stop a gap
   * from opening (or growing) past what existed when the drag began —
   * continuously across overflow/attached/gap regimes. Null when the drag
   * has no neighbor tail (trailing handles detach on purpose) or when
   * measurements are missing.
   */
  readonly tailAbsorb: {
    readonly lastId: string;
    /** The last pane's width when the drag began; its floor. */
    readonly basePx: number;
    /** What dragged + last must sum to for the starting gap to stay fixed. */
    readonly attachPx: number;
  } | null;
}

/** Current pointer interaction, excluded from persistence. */
export type LayoutInteraction = LayoutResizeDraft | null;

/** Recoverable failure surfaced to apps and the debug graph. */
export interface LayoutDiagnostic {
  readonly kind: 'storage' | 'registration';
  readonly message: string;
}

/** Persisted deviation from JSX defaults for one frame id. */
export interface LayoutNodeSnapshot {
  readonly size?: FrameSize;
  readonly open?: boolean;
  /** Present (true) only while a scrollable split is locked to fit. */
  readonly locked?: boolean;
}

/** Versioned geometry-only persistence payload; plain JSON, nothing else. */
export interface LayoutSnapshot {
  readonly formatVersion: 3;
  readonly nodes: Readonly<Record<string, LayoutNodeSnapshot>>;
}

const SIZE_PATTERN = /^(\d+(?:\.\d+)?)(px|fr)$/;

/** Parsed unit and value of a `FrameSize`, or null for an invalid spelling. */
export function parseFrameSize(
  value: string
): { readonly unit: 'px' | 'fr'; readonly value: number } | null {
  const match = SIZE_PATTERN.exec(value);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  return { unit: match[2] as 'px' | 'fr', value: parsed };
}

/** Parse one untrusted storage payload; null when the shape is not usable. */
export function parseLayoutSnapshot(input: unknown): LayoutSnapshot | null {
  if (typeof input !== 'object' || input === null) return null;
  const candidate = input as { formatVersion?: unknown; nodes?: unknown };
  if (candidate.formatVersion !== 3) return null;
  if (typeof candidate.nodes !== 'object' || candidate.nodes === null) {
    return null;
  }
  const nodes: Record<string, LayoutNodeSnapshot> = {};
  for (const [id, value] of Object.entries(candidate.nodes)) {
    if (typeof value !== 'object' || value === null) return null;
    const entry = value as { size?: unknown; open?: unknown; locked?: unknown };
    const node: { size?: FrameSize; open?: boolean; locked?: boolean } = {};
    if (entry.size !== undefined) {
      if (typeof entry.size !== 'string' || !parseFrameSize(entry.size)) {
        return null;
      }
      node.size = entry.size as FrameSize;
    }
    if (entry.open !== undefined) {
      if (typeof entry.open !== 'boolean') return null;
      node.open = entry.open;
    }
    if (entry.locked !== undefined) {
      if (typeof entry.locked !== 'boolean') return null;
      node.locked = entry.locked;
    }
    nodes[id] = node;
  }
  return { formatVersion: 3, nodes };
}
