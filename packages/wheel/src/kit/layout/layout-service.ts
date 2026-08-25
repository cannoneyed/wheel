import { Service, type ServiceContext } from '../../core/services';
import {
  parseFrameSize,
  parseLayoutSnapshot,
  type FrameAxis,
  type FrameRegistrationInput,
  type FrameSize,
  type LayoutDiagnostic,
  type LayoutInteraction,
  type LayoutMeasurement,
  type LayoutNode,
  type LayoutNodeSnapshot,
  type LayoutSnapshot
} from './model';
import { localLayoutStorage, memoryLayoutStorage, type LayoutStorage } from './storage';

/** Optional configuration; the zero-config default persists to local storage. */
export interface LayoutServiceOptions {
  readonly storage?: LayoutStorage;
  readonly storageKey?: string;
}

interface StoredNode extends FrameRegistrationInput {
  readonly open: boolean;
  readonly currentSize: FrameSize;
  /** True while this scrollable split is locked to fit. */
  readonly fitLocked: boolean;
}

const DEFAULT_STORAGE_PREFIX = 'wheel.layout';
const DEFAULT_STORAGE_KEY = 'frames';

/**
 * The batteries-included owner of frame geometry.
 *
 * Mounted `Frame` components register themselves by id; applications read
 * `node(id)` and call `open`/`close`/`toggle`/`resize`/`reset`. The service
 * owns only geometry — sizes, open state, constraints, measurements, resize
 * drafts, and persistence. Structure belongs to application JSX.
 */
export class LayoutService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'LayoutService';

  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  private readonly nodesAtom = this.atom<Readonly<Record<string, StoredNode>>>(
    {},
    'nodes'
  );
  private readonly childOrderAtom = this.atom<
    Readonly<Record<string, readonly string[]>>
  >({}, 'childOrder');
  private readonly measurementsAtom = this.atom<
    Readonly<Record<string, LayoutMeasurement>>
  >({}, 'measurements');
  private readonly diagnosticsAtom = this.atom<readonly LayoutDiagnostic[]>(
    [],
    'diagnostics'
  );
  /** Persisted deviations from JSX defaults, kept for unmounted ids too. */
  private readonly overrides = new Map<string, LayoutNodeSnapshot>();
  private readonly storage: LayoutStorage;
  private readonly storageKey: string;

  /** Current resize draft; committed geometry never contains pointer input. */
  readonly interaction = this.atom<LayoutInteraction>(null, 'interaction');

  /** Recoverable storage/registration failures visible to apps and the debug graph. */
  readonly diagnostics = this.computed(
    () => this.diagnosticsAtom.get(),
    'diagnostics'
  );

  constructor(context: ServiceContext, options: LayoutServiceOptions = {}) {
    super(context);
    this.storage = options.storage ?? defaultStorage();
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.restore();
  }

  /**
   * Read the live geometry record for one frame, or null while it is not
   * mounted. Reads never throw on absence — with live JSX, frames appearing
   * and disappearing is normal operation, not misuse. Actions still throw.
   */
  readonly node = this.computedFor((id: string): LayoutNode | null => {
    const stored = this.nodesAtom.get()[id];
    if (!stored) return null;
    const interaction = this.interaction.get();
    return {
      id,
      kind: stored.kind,
      parentId: stored.parentId,
      parentAxis: stored.parentAxis,
      open: stored.open,
      visible: this.visible(id),
      size: stored.currentSize,
      defaultSize: stored.size,
      minSize: stored.minSize,
      maxSize: stored.maxSize,
      collapseBelow: stored.collapseBelow,
      pixels: this.measurementsAtom.get()[id] ?? null,
      dragging:
        interaction !== null &&
        (interaction.beforeId === id ||
          (!interaction.solo && interaction.afterId === id)),
      scrollable: stored.scrollable,
      fitLocked: stored.fitLocked
    };
  }, 'node');

  /** True when a frame id is currently registered. */
  readonly has = this.computedFor(
    (id: string): boolean => this.nodesAtom.get()[id] !== undefined,
    'has'
  );

  /** Effective visibility: the user's request minus responsive collapse. */
  readonly visible = this.computedFor((id: string): boolean => {
    const stored = this.nodesAtom.get()[id];
    if (!stored) return false;
    if (!stored.open) return false;
    if (stored.collapseBelow === null) return true;
    const containerId = stored.parentId ?? id;
    const measurement = this.measurementsAtom.get()[containerId];
    if (!measurement) return true;
    const extent =
      stored.parentAxis === 'column'
        ? measurement.blockSize
        : measurement.inlineSize;
    return extent >= stored.collapseBelow;
  }, 'visible');

  /** Ordered child ids of one split, as reported by the mounted parent. */
  readonly childOrder = this.computedFor(
    (parentId: string): readonly string[] =>
      this.childOrderAtom.get()[parentId] ?? [],
    'childOrder'
  );

  /** The next visible sibling after `id`, or null; a trailing handle needs one. */
  readonly nextVisibleSibling = this.computedFor((id: string): string | null => {
    const stored = this.nodesAtom.get()[id];
    if (!stored?.parentId) return null;
    const order = this.childOrder(stored.parentId);
    const index = order.indexOf(id);
    if (index === -1 || !this.visible(id)) return null;
    for (let next = index + 1; next < order.length; next += 1) {
      const candidate = order[next]!;
      if (this.visible(candidate)) return candidate;
    }
    return null;
  }, 'nextVisibleSibling');

  /** Pixel size a frame should render at while a resize draft is in flight. */
  readonly draftPixels = this.computedFor((id: string): number | null => {
    const draft = this.interaction.get();
    if (!draft) return null;
    if (draft.beforeId === id) return draft.beforePx + draft.deltaPx;
    if (draft.solo) {
      // The no-gap invariant: the last pane holds its starting width and
      // grows exactly enough to keep the starting gap from widening.
      if (draft.tailAbsorb?.lastId === id) {
        const stored = this.nodesAtom.get()[id];
        const max = stored?.maxSize ?? null;
        const target = Math.max(
          draft.tailAbsorb.basePx,
          draft.tailAbsorb.attachPx - (draft.beforePx + draft.deltaPx)
        );
        return max === null ? target : Math.min(max, target);
      }
      // Every other sibling freezes at its measured size, so nothing but
      // the dragged boundary moves — fr tracks must not reflow mid-drag.
      const stored = this.nodesAtom.get()[id];
      if (stored?.parentId === draft.parentId) {
        return this.measuredExtent(id, draft.parentAxis);
      }
      return null;
    }
    if (draft.afterId === id) return draft.afterPx - draft.deltaPx;
    return null;
  }, 'draftPixels');

  /** Register one mounting frame; persisted deviations reapply by id. */
  readonly registerFrame = this.action((input: FrameRegistrationInput) => {
    if (!input.id) throw new Error('Frame id must be a non-empty string');
    if (!parseFrameSize(input.size)) {
      throw new Error(`Frame '${input.id}' has invalid size '${input.size}'`);
    }
    const nodes = this.nodesAtom.get();
    if (nodes[input.id]) {
      throw new Error(`Duplicate frame id '${input.id}'`);
    }
    const override = this.overrides.get(input.id);
    this.nodesAtom.set({
      ...nodes,
      [input.id]: {
        ...input,
        open: override?.open ?? input.defaultOpen,
        currentSize: override?.size ?? input.size,
        fitLocked: override?.locked ?? false
      }
    });
  }, 'registerFrame');

  /** Remove one unmounting frame; its persisted deviation survives for remount. */
  readonly unregisterFrame = this.action((id: string) => {
    const nodes = { ...this.nodesAtom.get() };
    if (!nodes[id]) return;
    delete nodes[id];
    this.nodesAtom.set(nodes);
    const measurements = { ...this.measurementsAtom.get() };
    if (measurements[id]) {
      delete measurements[id];
      this.measurementsAtom.set(measurements);
    }
    const draft = this.interaction.get();
    if (draft && (draft.beforeId === id || draft.afterId === id)) {
      this.interaction.set(null);
    }
  }, 'unregisterFrame');

  /** Record one split's DOM-ordered children; parents report on membership change. */
  readonly setChildOrder = this.action(
    (parentId: string, children: readonly string[]) => {
      const current = this.childOrderAtom.get();
      const existing = current[parentId];
      if (existing && sameOrder(existing, children)) return;
      this.childOrderAtom.set({ ...current, [parentId]: [...children] });
    },
    'setChildOrder'
  );

  /** Record one frame's rounded content-box size; equal reports are dropped. */
  readonly reportMeasurement = this.action(
    (id: string, measurement: LayoutMeasurement) => {
      const measurements = this.measurementsAtom.get();
      const existing = measurements[id];
      if (
        existing &&
        existing.inlineSize === measurement.inlineSize &&
        existing.blockSize === measurement.blockSize
      ) {
        return;
      }
      this.measurementsAtom.set({ ...measurements, [id]: measurement });
    },
    'reportMeasurement'
  );

  /** Open one frame; restores its remembered size. */
  readonly open = this.action((id: string) => {
    this.setOpen(id, true);
  }, 'open');

  /** Close one frame; neighbors absorb its space, its size is remembered. */
  readonly close = this.action((id: string) => {
    this.setOpen(id, false);
  }, 'close');

  /** Toggle one frame between open and closed. */
  readonly toggle = this.action((id: string) => {
    this.setOpen(id, !this.requireNode(id).open);
  }, 'toggle');

  /** Set one frame's track preference directly. */
  readonly resize = this.action((id: string, size: FrameSize) => {
    if (!parseFrameSize(size)) {
      throw new Error(`Invalid frame size '${size}'`);
    }
    const stored = this.requireNode(id);
    this.patchNode(id, { currentSize: size });
    this.rememberDeviation(id, { ...stored, currentSize: size });
    this.persist();
  }, 'resize');

  /**
   * Lock or unlock a scrollable split's fit mode directly — e.g. an app's
   * "fit widths" action locking the row it just made fit.
   */
  readonly setFitLocked = this.action((id: string, locked: boolean) => {
    this.requireNode(id);
    this.setSplitLocked(id, locked);
    this.persist();
  }, 'setFitLocked');

  /** Forget persisted deviations for one frame, or for every frame. */
  readonly reset = this.action((id?: string) => {
    if (id === undefined) {
      this.overrides.clear();
    } else {
      this.overrides.delete(id);
    }
    const nodes = { ...this.nodesAtom.get() };
    for (const [nodeId, stored] of Object.entries(nodes)) {
      if (id !== undefined && nodeId !== id) continue;
      nodes[nodeId] = {
        ...stored,
        open: stored.defaultOpen,
        currentSize: stored.size,
        fitLocked: false
      };
    }
    this.nodesAtom.set(nodes);
    this.persist();
  }, 'reset');

  /**
   * Begin a resize transaction. `afterId` is null for a trailing handle in a
   * scrollable split, where the dragged track has no neighbor to trade with.
   */
  readonly beginResize = this.action(
    (beforeId: string, afterId: string | null) => {
      const draft = this.buildResizeDraft(beforeId, afterId);
      if (draft) this.interaction.set(draft);
    },
    'beginResize'
  );

  /**
   * Update the in-flight resize draft; clamped to the draft's constraints.
   * `snappedEdgeId` marks the pane whose trailing edge the drag is currently
   * locked onto, so any handle can render the lock.
   */
  readonly updateResize = this.action(
    (deltaPx: number, snappedEdgeId: string | null = null) => {
      const draft = this.interaction.get();
      if (!draft) return;
      const clamped = clamp(deltaPx, draft.minDelta, draft.maxDelta);
      if (clamped === draft.deltaPx && snappedEdgeId === draft.snappedEdgeId) {
        return;
      }
      this.interaction.set({ ...draft, deltaPx: clamped, snappedEdgeId });
    },
    'updateResize'
  );

  /** Commit the in-flight resize draft as one preference update and persist. */
  readonly commitResize = this.action(() => {
    const draft = this.interaction.get();
    this.interaction.set(null);
    if (!draft) return;
    // A zero-delta commit is a no-op — unless it is snapped, where "nothing
    // moved" still means "lock the split at exactly this fit".
    if (draft.deltaPx === 0 && draft.snappedEdgeId === null) return;
    this.applyResize(draft, draft.deltaPx);
    this.persist();
  }, 'commitResize');

  /** Discard the in-flight resize draft. */
  readonly cancelResize = this.action(() => {
    this.interaction.set(null);
  }, 'cancelResize');

  /** One-step keyboard resize between two siblings; same math as pointer drag. */
  readonly resizeBy = this.action(
    (beforeId: string, afterId: string | null, deltaPx: number) => {
      const draft = this.buildResizeDraft(beforeId, afterId);
      if (!draft) return;
      const clamped = clamp(deltaPx, draft.minDelta, draft.maxDelta);
      if (clamped === 0) return;
      this.applyResize(draft, clamped);
      this.persist();
    },
    'resizeBy'
  );

  /** Restore both adjacent tracks to their JSX defaults; double-click behavior. */
  readonly resetPair = this.action((beforeId: string, afterId: string) => {
    for (const id of [beforeId, afterId]) {
      const stored = this.requireNode(id);
      this.overrides.delete(id);
      this.patchNode(id, {
        open: stored.defaultOpen,
        currentSize: stored.size
      });
    }
    this.persist();
  }, 'resetPair');

  private requireNode(id: string): StoredNode {
    const stored = this.nodesAtom.get()[id];
    if (!stored) throw new Error(`Unknown frame '${id}'`);
    return stored;
  }

  private patchNode(id: string, patch: Partial<StoredNode>): void {
    const nodes = this.nodesAtom.get();
    this.nodesAtom.set({ ...nodes, [id]: { ...nodes[id]!, ...patch } });
  }

  private setOpen(id: string, open: boolean): void {
    const stored = this.requireNode(id);
    if (stored.open === open) return;
    this.patchNode(id, { open });
    this.rememberDeviation(id, { ...stored, open });
    this.persist();
  }

  /** Store only real deviations; a node back at its defaults leaves no entry. */
  private rememberDeviation(id: string, stored: StoredNode): void {
    const entry: { size?: FrameSize; open?: boolean; locked?: boolean } = {};
    if (stored.currentSize !== stored.size) entry.size = stored.currentSize;
    if (stored.open !== stored.defaultOpen) entry.open = stored.open;
    if (stored.fitLocked) entry.locked = true;
    if (
      entry.size === undefined &&
      entry.open === undefined &&
      entry.locked === undefined
    ) {
      this.overrides.delete(id);
    } else {
      this.overrides.set(id, entry);
    }
  }

  private buildResizeDraft(
    beforeId: string,
    afterId: string | null
  ): LayoutInteraction {
    const before = this.requireNode(beforeId);
    if (!before.parentId) return null;
    const parentAxis = before.parentAxis;
    if (!parentAxis) return null;
    const beforePx = this.measuredExtent(beforeId, parentAxis);
    if (beforePx === null) return null;
    // A scrollable split resizes solo: the dragged track's own clamps are the
    // only limits, because growth spills into overflow instead of a neighbor.
    // Once fit-LOCKED, drags trade space again (pair semantics) so the row
    // keeps fitting — except the trailing handle, whose solo drag is how the
    // lock is released.
    const parent = this.nodesAtom.get()[before.parentId];
    const scrollableAxis =
      parent?.scrollable === (parentAxis === 'row' ? 'x' : 'y');
    const solo =
      scrollableAxis && (!(parent?.fitLocked ?? false) || afterId === null);
    let afterPx = 0;
    if (afterId === null) {
      // Only a scrollable split has a neighborless trailing handle.
      if (!solo) return null;
    } else {
      const after = this.requireNode(afterId);
      if (after.parentId !== before.parentId) return null;
      const measured = this.measuredExtent(afterId, parentAxis);
      if (measured === null) return null;
      afterPx = measured;
    }
    const after = afterId === null ? null : this.requireNode(afterId);
    const minDelta = solo
      ? before.minSize - beforePx
      : Math.max(
          before.minSize - beforePx,
          after!.maxSize === null ? -Infinity : afterPx - after!.maxSize
        );
    const maxDelta = solo
      ? before.maxSize === null
        ? Infinity
        : before.maxSize - beforePx
      : Math.min(
          afterPx - after!.minSize,
          before.maxSize === null ? Infinity : before.maxSize - beforePx
        );
    if (minDelta > maxDelta) return null;
    return {
      kind: 'resize',
      parentId: before.parentId,
      parentAxis,
      beforeId,
      afterId,
      beforePx,
      afterPx,
      deltaPx: 0,
      minDelta,
      maxDelta,
      solo,
      snappedEdgeId: null,
      tailAbsorb:
        solo && afterId !== null
          ? this.buildTailAbsorb(before.parentId, parentAxis, beforeId, beforePx)
          : null
    };
  }

  /**
   * The no-gap invariant for a non-trailing solo drag, regime-free: from the
   * frozen siblings and the starting gap (deliberate gaps are preserved, not
   * closed), compute what the dragged pane and the last pane must sum to so
   * the gap never grows. The last pane's floor is its starting width, so it
   * never shrinks during someone else's drag.
   */
  private buildTailAbsorb(
    parentId: string,
    parentAxis: FrameAxis,
    beforeId: string,
    beforePx: number
  ): { lastId: string; basePx: number; attachPx: number } | null {
    const container = this.measuredExtent(parentId, parentAxis);
    if (container === null) return null;
    const visibleChildren = this.childOrder(parentId).filter((id) =>
      this.visible(id)
    );
    const lastId = visibleChildren[visibleChildren.length - 1];
    if (!lastId || lastId === beforeId) return null;
    let othersFrozen = 0;
    let basePx: number | null = null;
    for (const childId of visibleChildren) {
      const px = this.measuredExtent(childId, parentAxis);
      if (px === null) return null;
      if (childId === lastId) basePx = px;
      else if (childId !== beforeId) othersFrozen += px;
    }
    if (basePx === null) return null;
    const startingGap = Math.max(
      0,
      container - (othersFrozen + beforePx + basePx)
    );
    return {
      lastId,
      basePx,
      attachPx: container - startingGap - othersFrozen
    };
  }

  private measuredExtent(id: string, axis: FrameAxis): number | null {
    const measurement = this.measurementsAtom.get()[id];
    if (!measurement) return null;
    return axis === 'column' ? measurement.blockSize : measurement.inlineSize;
  }

  /**
   * Turn a clamped resize delta into preferences. Solo (scrollable-split)
   * resizes pin the dragged track to pixels and leave the neighbor alone;
   * pair resizes keep the existing fit-mode rules.
   */
  private applyResize(
    draft: Exclude<LayoutInteraction, null>,
    deltaPx: number
  ): void {
    if (draft.solo) {
      if (draft.snappedEdgeId !== null) {
        this.lockSplitToFit(draft, deltaPx);
        return;
      }
      // Pin every visible sibling at its draft size: measured for frozen
      // siblings, the absorbed value for a tail-absorbing last pane (which
      // must not rely on a mid-drag measurement — keyboard resizes commit
      // without ever rendering a draft).
      for (const siblingId of this.childOrder(draft.parentId)) {
        if (siblingId === draft.beforeId) continue;
        const sibling = this.nodesAtom.get()[siblingId];
        if (!sibling || !this.visible(siblingId)) continue;
        let target: number | null;
        if (draft.tailAbsorb?.lastId === siblingId) {
          const absorbed = Math.max(
            draft.tailAbsorb.basePx,
            draft.tailAbsorb.attachPx - (draft.beforePx + deltaPx)
          );
          target =
            sibling.maxSize === null
              ? absorbed
              : Math.min(sibling.maxSize, absorbed);
        } else {
          target = this.measuredExtent(siblingId, draft.parentAxis);
        }
        if (target === null) continue;
        const pinned: FrameSize = `${round(target)}px`;
        if (sibling.currentSize === pinned) continue;
        this.patchNode(siblingId, { currentSize: pinned });
        this.rememberDeviation(siblingId, { ...sibling, currentSize: pinned });
      }
      const stored = this.requireNode(draft.beforeId);
      const size: FrameSize = `${round(draft.beforePx + deltaPx)}px`;
      this.patchNode(draft.beforeId, { currentSize: size });
      this.rememberDeviation(draft.beforeId, { ...stored, currentSize: size });
      // An unsnapped solo drag pulls the edge off the fit: release the lock.
      this.setSplitLocked(draft.parentId, false);
      return;
    }
    this.applyPairResize(draft.beforeId, draft.afterId!, {
      beforePx: draft.beforePx + deltaPx,
      afterPx: draft.afterPx - deltaPx
    });
  }

  /**
   * A snapped commit: every visible child becomes a fractional weight
   * proportional to its final pixels, and the split is marked fit-locked.
   * From here flex owns the fit — removing, adding, or resizing panes
   * re-distributes proportionally with no overflow to absorb.
   */
  private lockSplitToFit(
    draft: Exclude<LayoutInteraction, null>,
    deltaPx: number
  ): void {
    const widths = new Map<string, number>();
    for (const childId of this.childOrder(draft.parentId)) {
      if (!this.visible(childId)) continue;
      const px =
        childId === draft.beforeId
          ? draft.beforePx + deltaPx
          : this.measuredExtent(childId, draft.parentAxis);
      if (px !== null && px > 0) widths.set(childId, px);
    }
    const total = [...widths.values()].reduce((sum, px) => sum + px, 0);
    if (total <= 0) return;
    for (const [childId, px] of widths) {
      const stored = this.nodesAtom.get()[childId];
      if (!stored) continue;
      const size: FrameSize = `${round((px * widths.size) / total)}fr`;
      this.patchNode(childId, { currentSize: size });
      this.rememberDeviation(childId, { ...stored, currentSize: size });
    }
    this.setSplitLocked(draft.parentId, true);
  }

  /** Set or clear a split's fit lock, persisting the deviation. */
  private setSplitLocked(id: string, locked: boolean): void {
    const stored = this.nodesAtom.get()[id];
    if (!stored || stored.fitLocked === locked) return;
    this.patchNode(id, { fitLocked: locked });
    this.rememberDeviation(id, { ...stored, fitLocked: locked });
  }

  /**
   * Turn final pair pixels into preferences. Pixel tracks store pixels; a
   * fractional pair redistributes its combined weight by final proportion so
   * unrelated siblings keep their share.
   */
  private applyPairResize(
    beforeId: string,
    afterId: string,
    final: { readonly beforePx: number; readonly afterPx: number }
  ): void {
    const before = this.requireNode(beforeId);
    const after = this.requireNode(afterId);
    const beforeUnit = parseFrameSize(before.currentSize)!;
    const afterUnit = parseFrameSize(after.currentSize)!;
    const next = new Map<string, FrameSize>();
    if (beforeUnit.unit === 'fr' && afterUnit.unit === 'fr') {
      const total = beforeUnit.value + afterUnit.value;
      const span = final.beforePx + final.afterPx;
      if (span > 0 && total > 0) {
        const beforeWeight = round((total * final.beforePx) / span);
        next.set(beforeId, `${beforeWeight}fr`);
        next.set(afterId, `${round(total - beforeWeight)}fr`);
      }
    } else {
      if (beforeUnit.unit === 'px') {
        next.set(beforeId, `${round(final.beforePx)}px`);
      }
      if (afterUnit.unit === 'px') {
        next.set(afterId, `${round(final.afterPx)}px`);
      }
    }
    for (const [id, size] of next) {
      const stored = this.requireNode(id);
      this.patchNode(id, { currentSize: size });
      this.rememberDeviation(id, { ...stored, currentSize: size });
    }
  }

  private restore(): void {
    let raw: unknown;
    try {
      raw = this.storage.read(this.storageKey);
    } catch (error) {
      this.addDiagnostic('storage', `Layout restore failed: ${String(error)}`);
      return;
    }
    if (raw === undefined) return;
    const snapshot = parseLayoutSnapshot(raw);
    if (!snapshot) {
      this.addDiagnostic('storage', 'Layout snapshot was invalid; using defaults');
      try {
        this.storage.remove(this.storageKey);
      } catch {
        // Removal is best-effort; the invalid value is already ignored.
      }
      return;
    }
    for (const [id, entry] of Object.entries(snapshot.nodes)) {
      this.overrides.set(id, entry);
    }
  }

  private persist(): void {
    const snapshot: LayoutSnapshot = {
      formatVersion: 3,
      nodes: Object.fromEntries(this.overrides)
    };
    try {
      if (this.overrides.size === 0) {
        this.storage.remove(this.storageKey);
      } else {
        this.storage.write(this.storageKey, snapshot);
      }
    } catch (error) {
      this.addDiagnostic('storage', `Layout save failed: ${String(error)}`);
    }
  }

  private addDiagnostic(kind: LayoutDiagnostic['kind'], message: string): void {
    this.diagnosticsAtom.set([...this.diagnosticsAtom.get(), { kind, message }]);
  }
}

function defaultStorage(): LayoutStorage {
  if (globalThis.localStorage === undefined) return memoryLayoutStorage();
  return localLayoutStorage(DEFAULT_STORAGE_PREFIX);
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
