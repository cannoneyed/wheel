import {
  createContext,
  onCleanup,
  onMount,
  Show,
  useContext,
  type JSX,
  type ParentProps
} from 'solid-js';

import { componentRoot, connect } from '../../core/connect';
import { useSignal } from '../../core/local-state';
import { view } from '../../core/view';
import { createGesture } from './gesture-dom';
import { LayoutService } from './layout-service';
import { Scrollbar } from './scrollbar';
import {
  parseFrameSize,
  type FrameAxis,
  type FrameKind,
  type FrameSize,
  type LayoutNode
} from './model';

/** A pixel length in its one accepted spelling: `'240px'`. */
export type FramePixels = `${number}px`;

/** Shared geometry props for `Frame.Row` and `Frame.Column`. */
export interface FrameSplitProps extends ParentProps {
  /** App-unique persistence key, action target, and debug label. */
  readonly id: string;
  /** Track preference in the parent split; `'240px'` or `'1fr'`. */
  readonly size?: FrameSize;
  /** Lower resize clamp. */
  readonly minSize?: FramePixels;
  /** Upper resize clamp. */
  readonly maxSize?: FramePixels;
  /** Auto-collapse when the parent container is narrower than this. */
  readonly collapseBelow?: FramePixels;
  /** Initial open state; the persisted user choice wins on remount. */
  readonly defaultOpen?: boolean;
  readonly class?: string;
  readonly style?: JSX.CSSProperties;
  /** New DOM-ordered child ids after a completed child reorder drag. */
  readonly onReorder?: (ids: readonly string[]) => void;
  /** Make this frame draggable for its parent's reorder/drop handling. */
  readonly draggable?: boolean;
  /**
   * Let content overflow along one axis behind a framework-drawn permanent
   * scrollbar; the native scrollbar is hidden.
   */
  readonly scrollable?: 'x' | 'y';
}

/** Props for the pull-over overlay panel. */
export interface FrameDrawerProps extends ParentProps {
  readonly id: string;
  /** Edge the drawer enters from. */
  readonly side?: 'left' | 'right' | 'top' | 'bottom';
  /** Main-axis extent; drawers are pixel-sized. */
  readonly size?: FramePixels;
  /** Drawers start closed unless the persisted user choice says otherwise. */
  readonly defaultOpen?: boolean;
  /** Accessible name for the drawer region. */
  readonly label?: string;
  readonly class?: string;
  readonly style?: JSX.CSSProperties;
}

interface FrameParentContextValue {
  readonly id: string;
  readonly axis: FrameAxis;
  /** The parent's overflow axis, when it scrolls instead of fitting. */
  readonly scrollable: 'x' | 'y' | null;
  /** Adopt one mounting child element; returns a disposer. */
  readonly adopt: (childId: string, element: HTMLElement) => () => void;
  /** True when this split accepts child reorder drags. */
  readonly reorderable: boolean;
  /** True while a child reorder drag is in flight in this split. */
  readonly reorderActive: () => boolean;
  /** Preview a child drag at a main-axis pointer position; null clears it. */
  readonly previewReorder: (dragId: string, pointer: number | null) => void;
  /** Commit a child drag: compute the new id order and call `onReorder`. */
  readonly commitReorder: (dragId: string, pointer: number) => void;
}

const FrameParentContext = createContext<FrameParentContextValue | null>(null);

/** The parent split a frame is registered under, or null at a root. */
export function useFrameParent(): FrameParentContextValue | null {
  return useContext(FrameParentContext);
}

interface FrameShellProps extends FrameSplitProps {
  readonly kind: FrameKind;
  readonly side?: 'left' | 'right' | 'top' | 'bottom';
  readonly label?: string;
}

// wheel-component-states: geometry primitive — Frame's states are LayoutService trees, exercised by the framing demo, not stubbable shapes
// wheel-connect-surface: Frame is the framework's one geometry primitive; it
// alone bridges every LayoutService seam (registration, measurement, resize
// transaction, reset) so application components never have to.
const connectFrame = connect(
  (props: FrameShellProps) => `Frame:${props.id}`,
  (c, props: FrameShellProps) => {
    const layout = c.service(LayoutService);
    return view(
      {
        node: (): LayoutNode | null => layout.node(props.id),
        visible: (): boolean =>
          layout.has(props.id) ? layout.visible(props.id) : true,
        nextSibling: (): string | null => layout.nextVisibleSibling(props.id),
        draftPixels: (): number | null => layout.draftPixels(props.id),
        interaction: layout.interaction
      },
      {
        registerFrame: layout.registerFrame,
        unregisterFrame: layout.unregisterFrame,
        setChildOrder: layout.setChildOrder,
        reportMeasurement: layout.reportMeasurement,
        beginResize: layout.beginResize,
        updateResize: layout.updateResize,
        commitResize: layout.commitResize,
        cancelResize: layout.cancelResize,
        resizeBy: layout.resizeBy,
        resetPair: layout.resetPair,
        toggle: layout.toggle
      }
    );
  },
  { group: 'framework' }
);

const KEYBOARD_STEP = 10;
const KEYBOARD_STEP_COARSE = 50;
const CLAMP_TO_LIMIT = 1_000_000;
/** Pointer distance within which a solo drag locks onto the fit width. */
const SNAP_TOLERANCE = 3;

/**
 * Handle hit area, tunable per app via `--wheel-frame-handle-size`. The strip
 * straddles the boundary, so half of it overhangs each neighbor's content —
 * the 12px default keeps that overhang to 6px so trailing-edge controls stay
 * clickable; touch-heavy apps can widen it in CSS.
 */
const HANDLE_SIZE = 'var(--wheel-frame-handle-size, 12px)';

function parsePixels(value: FramePixels | undefined): number | null {
  if (value === undefined) return null;
  const parsed = parseFrameSize(value);
  return parsed?.unit === 'px' ? parsed.value : null;
}

function frameSizeOf(props: FrameShellProps): FrameSize {
  return props.size ?? (props.kind === 'drawer' ? '320px' : '1fr');
}

/**
 * The single connected frame primitive behind `Frame.Row`, `Frame.Column`,
 * and `Frame.Drawer`. It registers itself with `LayoutService` on mount,
 * reports its measured content box, renders its track from live geometry,
 * and owns the trailing resize handle shared with its next visible sibling.
 */
function FrameShell(props: FrameShellProps): JSX.Element {
  const state = connectFrame(props);
  const parent = useFrameParent();
  const [hovered, setHovered] = useSignal(false, 'hovered');
  const [draggingReorder, setDraggingReorder] = useSignal(false, 'draggingReorder');

  let element: HTMLDivElement | undefined;
  let content: HTMLDivElement | undefined;
  let handle: HTMLDivElement | undefined;

  const axis: FrameAxis = props.kind === 'row' ? 'row' : 'column';
  const isDrawer = props.kind === 'drawer';
  const parentAxis = isDrawer ? null : (parent?.axis ?? null);
  const horizontal = parentAxis === 'row';

  const childElements = new Map<string, HTMLElement>();
  const syncChildOrder = (): void => {
    const ordered = [...childElements.entries()]
      .sort(([, a], [, b]) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      )
      .map(([id]) => id);
    state.setChildOrder(props.id, ordered);
  };

  const [reorderAt, setReorderAt] = useSignal<number | null>(null, 'reorderAt');

  /** Visible child rects (minus the dragged child), sorted along this axis. */
  const reorderSlots = (
    dragId: string
  ): readonly { id: string; start: number; end: number }[] => {
    const start = axis === 'row' ? 'left' : 'top';
    const end = axis === 'row' ? 'right' : 'bottom';
    return [...childElements.entries()]
      .filter(([id]) => id !== dragId)
      .map(([id, childElement]) => {
        const rect = childElement.getBoundingClientRect();
        return { id, start: rect[start], end: rect[end] };
      })
      .filter((slot) => slot.end - slot.start > 0)
      .sort((a, b) => a.start - b.start);
  };

  const insertionIndex = (
    slots: readonly { start: number; end: number }[],
    pointer: number
  ): number => {
    const index = slots.findIndex(
      (slot) => pointer < (slot.start + slot.end) / 2
    );
    return index === -1 ? slots.length : index;
  };

  const context: FrameParentContextValue = {
    id: props.id,
    axis,
    scrollable: props.scrollable ?? null,
    adopt: (childId, childElement) => {
      childElements.set(childId, childElement);
      syncChildOrder();
      return () => {
        childElements.delete(childId);
        syncChildOrder();
      };
    },
    reorderable: props.onReorder !== undefined,
    reorderActive: () => reorderAt() !== null,
    previewReorder: (dragId, pointer) => {
      if (pointer === null || !content) {
        setReorderAt(null);
        return;
      }
      const slots = reorderSlots(dragId);
      if (slots.length === 0) {
        setReorderAt(null);
        return;
      }
      const index = insertionIndex(slots, pointer);
      const boundary =
        index === 0
          ? slots[0]!.start
          : index === slots.length
            ? slots[slots.length - 1]!.end
            : (slots[index - 1]!.end + slots[index]!.start) / 2;
      const contentRect = content.getBoundingClientRect();
      // Client-rect coordinates are viewport-based; the indicator is absolute
      // in the (possibly scrolled) content box, so scroll offset re-enters.
      setReorderAt(
        axis === 'row'
          ? boundary - contentRect.left + content.scrollLeft
          : boundary - contentRect.top + content.scrollTop
      );
    },
    commitReorder: (dragId, pointer) => {
      setReorderAt(null);
      const slots = reorderSlots(dragId);
      const ids = slots.map((slot) => slot.id);
      ids.splice(insertionIndex(slots, pointer), 0, dragId);
      props.onReorder?.(ids);
    }
  };

  const open = (): boolean => state.node?.open ?? props.defaultOpen ?? !isDrawer;
  const visible = (): boolean => (state.node ? state.visible : open());
  const size = (): FrameSize => state.node?.size ?? frameSizeOf(props);
  const minPixels = (): number => parsePixels(props.minSize) ?? 0;
  const maxPixels = (): number | null => parsePixels(props.maxSize);

  const trackStyle = (): JSX.CSSProperties => {
    const base: JSX.CSSProperties = {
      position: 'relative',
      display: 'flex',
      // The scrollbar gutter stacks below (axis x) or beside (axis y) the
      // content; without one the single in-flow child makes this moot.
      'flex-direction': props.scrollable === 'y' ? 'row' : 'column',
      'min-width': '0',
      'min-height': '0'
    };
    if (isDrawer) return { ...base, ...drawerStyle() };
    if (!parent) {
      return { ...base, flex: '1 1 auto', width: '100%', height: '100%' };
    }
    const main = horizontal ? 'width' : 'height';
    const minProp = horizontal ? 'min-width' : 'min-height';
    const maxProp = horizontal ? 'max-width' : 'max-height';
    if (!visible()) {
      return {
        ...base,
        flex: '0 0 0px',
        [minProp]: '0px',
        [main]: '0px',
        visibility: 'hidden'
      };
    }
    const draft = state.draftPixels;
    if (draft !== null) {
      return { ...base, flex: `0 0 ${Math.max(0, draft)}px`, [minProp]: '0px' };
    }
    const parsed = parseFrameSize(size())!;
    const constraints: JSX.CSSProperties = { [minProp]: `${minPixels()}px` };
    const max = maxPixels();
    if (max !== null) constraints[maxProp] = `${max}px`;
    if (parsed.unit === 'px') {
      return { ...base, flex: `0 0 ${parsed.value}px`, ...constraints };
    }
    // Grow factors are scaled ×1000: flexbox hands out only Σgrow of the
    // free space when the factors sum below 1, so a lone `0.9fr` pane (a
    // sibling pinned to px mid-drag, weights from a fit-lock conversion)
    // would leave 10% of the row as a gap. Ratios are all that matter.
    return { ...base, flex: `${parsed.value * 1000} 1 0%`, ...constraints };
  };

  const drawerStyle = (): JSX.CSSProperties => {
    const side = props.side ?? 'left';
    const main = side === 'left' || side === 'right' ? 'width' : 'height';
    const closedTransform = {
      left: 'translateX(-100%)',
      right: 'translateX(100%)',
      top: 'translateY(-100%)',
      bottom: 'translateY(100%)'
    }[side];
    const inset: JSX.CSSProperties =
      main === 'width'
        ? { top: '0', bottom: '0', [side]: '0' }
        : { left: '0', right: '0', [side]: '0' };
    const parsed = parseFrameSize(size())!;
    const extent = parsed.unit === 'px' ? parsed.value : 320;
    const isOpen = visible();
    return {
      position: 'absolute',
      ...inset,
      [main]: `${extent}px`,
      transform: isOpen ? 'none' : closedTransform,
      visibility: isOpen ? 'visible' : 'hidden',
      'pointer-events': isOpen ? 'auto' : 'none',
      'z-index': 40
    };
  };

  const contentStyle = (): JSX.CSSProperties => {
    const scroll: JSX.CSSProperties =
      props.scrollable === 'x'
        ? { 'overflow-x': 'auto', 'scrollbar-width': 'none' }
        : props.scrollable === 'y'
          ? { 'overflow-y': 'auto', 'scrollbar-width': 'none' }
          : {};
    return {
      position: 'relative',
      display: 'flex',
      'flex-direction': axis === 'row' ? 'row' : 'column',
      flex: '1 1 auto',
      'min-width': '0',
      'min-height': '0',
      overflow: 'hidden',
      ...scroll,
      ...props.style
    };
  };

  const reorderIndicatorStyle = (): JSX.CSSProperties => {
    const at = reorderAt();
    if (at === null) return { display: 'none' };
    const shared: JSX.CSSProperties = {
      position: 'absolute',
      'z-index': 40,
      'pointer-events': 'none',
      background: 'var(--wheel-frame-reorder, rgba(90, 120, 255, 0.9))'
    };
    return axis === 'row'
      ? { ...shared, top: '0', bottom: '0', left: `${at - 1}px`, width: '2px' }
      : { ...shared, left: '0', right: '0', top: `${at - 1}px`, height: '2px' };
  };

  // Inside a scrollable split every child has a trailing handle — including
  // the last or only one, whose growth just extends the overflow.
  const parentSolo =
    parent !== null &&
    parent.scrollable === (parent.axis === 'row' ? 'x' : 'y');
  const handleVisible = (): boolean =>
    !isDrawer &&
    parent !== null &&
    visible() &&
    (state.nextSibling !== null || parentSolo);

  /**
   * A last child in a scrollable split has no boundary to straddle: its
   * handle sits fully inside the trailing edge (no phantom overflow from an
   * overhang) and above the ancestor's own boundary handle it can meet when
   * the row is scrolled to the end.
   */
  const trailingInside = (): boolean => parentSolo && state.nextSibling === null;

  /**
   * This pane's trailing edge is snapped by the in-flight drag. The lock is
   * drag feedback only — the fit-locked MODE outlives the drag, but its
   * chrome never does.
   */
  const dragSnapped = (): boolean => {
    const draft = state.interaction;
    return draft?.kind === 'resize' && draft.snappedEdgeId === props.id;
  };

  /**
   * THIS pane's trailing boundary is the one being dragged. Distinct from
   * `node.dragging`, which is true for both sides of a pair draft — a pane
   * whose LEADING edge is dragged must not light its own trailing handle.
   */
  const trailingDragged = (): boolean => {
    const draft = state.interaction;
    return draft?.kind === 'resize' && draft.beforeId === props.id;
  };

  const handleStyle = (): JSX.CSSProperties => {
    if (!handleVisible()) return { display: 'none' };
    const inside = trailingInside();
    const overhang = `calc(${HANDLE_SIZE} / -2)`;
    const shared: JSX.CSSProperties = {
      position: 'absolute',
      'z-index': inside ? 31 : 30,
      'touch-action': 'none',
      background: 'transparent',
      // While a sibling reorder drag runs, the handle must neither glow nor
      // swallow the pointer — the drag, not the divider, owns this gesture.
      'pointer-events': parent?.reorderActive() ? 'none' : 'auto'
    };
    return horizontal
      ? {
          ...shared,
          top: '0',
          bottom: '0',
          right: inside ? '0' : overhang,
          width: inside ? `calc(${HANDLE_SIZE} / 2)` : HANDLE_SIZE,
          cursor: 'col-resize'
        }
      : {
          ...shared,
          left: '0',
          right: '0',
          bottom: inside ? '0' : overhang,
          height: inside ? `calc(${HANDLE_SIZE} / 2)` : HANDLE_SIZE,
          cursor: 'row-resize'
        };
  };

  const dividerStyle = (): JSX.CSSProperties => {
    // Hover glow only while nothing is being dragged: during another
    // handle's resize, a stale hover state must not paint this divider.
    const active =
      trailingDragged() ||
      (hovered() && state.interaction === null && !parent?.reorderActive());
    const paint = dragSnapped()
      ? 'var(--wheel-frame-divider-snap, #2dd4bf)'
      : active
        ? 'var(--wheel-frame-divider-active, rgba(90, 120, 255, 0.9))'
        : 'var(--wheel-frame-divider, rgba(128, 128, 128, 0.35))';
    const thickness = active || dragSnapped() ? 3 : 1;
    const inside = trailingInside();
    const offset = `calc(50% - ${thickness / 2}px)`;
    return horizontal
      ? {
          position: 'absolute',
          top: '0',
          bottom: '0',
          ...(inside ? { right: '0' } : { left: offset }),
          width: `${thickness}px`,
          background: paint
        }
      : {
          position: 'absolute',
          left: '0',
          right: '0',
          ...(inside ? { bottom: '0' } : { top: offset }),
          height: `${thickness}px`,
          background: paint
        };
  };

  const measuredExtent = (): number | null => {
    const pixels = state.node?.pixels;
    if (!pixels) return null;
    return horizontal ? pixels.inlineSize : pixels.blockSize;
  };

  /**
   * The lock badge riding the divider, centered along the handle. On a
   * trailing-inside handle it hangs fully inside the pane — anything past
   * the trailing edge would itself create the overflow the snap removes.
   */
  const snapLockStyle = (): JSX.CSSProperties => {
    const inside = trailingInside();
    const shared: JSX.CSSProperties = {
      position: 'absolute',
      'z-index': 32,
      padding: '1px 3px',
      'border-radius': '4px',
      border: '1px solid var(--wheel-frame-divider-snap, #2dd4bf)',
      background: 'var(--wheel-frame-snap-badge, rgba(13, 148, 136, 0.25))',
      'font-size': '9px',
      'line-height': '1.2',
      'pointer-events': 'none',
      'user-select': 'none'
    };
    return horizontal
      ? inside
        ? { ...shared, top: '50%', right: '4px', transform: 'translateY(-50%)' }
        : {
            ...shared,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }
      : inside
        ? { ...shared, left: '50%', bottom: '4px', transform: 'translateX(-50%)' }
        : {
            ...shared,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)'
          };
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    const next = state.nextSibling;
    if (next === null && !parentSolo) return;
    const step = event.shiftKey ? KEYBOARD_STEP_COARSE : KEYBOARD_STEP;
    const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
    let delta: number;
    switch (event.key) {
      case decrease:
        delta = -step;
        break;
      case increase:
        delta = step;
        break;
      case 'Home':
        delta = -CLAMP_TO_LIMIT;
        break;
      case 'End':
        delta = CLAMP_TO_LIMIT;
        break;
      case 'Enter':
        event.preventDefault();
        state.toggle(props.id);
        return;
      default:
        return;
    }
    event.preventDefault();
    state.resizeBy(props.id, next, delta);
  };

  // DOM ownership boundary: registration, measurement observers, child-order
  // sync, and gesture binding all need the mounted elements; cleanup must
  // unregister so the service never holds a record for an unmounted frame.
  onMount(() => {
    state.registerFrame({
      id: props.id,
      kind: props.kind,
      parentId: isDrawer ? null : (parent?.id ?? null),
      parentAxis,
      size: frameSizeOf(props),
      minSize: minPixels(),
      maxSize: maxPixels(),
      collapseBelow: parsePixels(props.collapseBelow),
      defaultOpen: props.defaultOpen ?? !isDrawer,
      scrollable: props.scrollable ?? null
    });
    const disposeAdopt =
      !isDrawer && parent && element ? parent.adopt(props.id, element) : null;

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && element) {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const box = entry.contentBoxSize?.[0];
          // Centipixel precision: solo drafts freeze siblings at these
          // values, and integer rounding would shift the row's far edge off
          // the snap point by up to a pixel per pane.
          const centi = (value: number): number => Math.round(value * 100) / 100;
          state.reportMeasurement(props.id, {
            inlineSize: centi(box?.inlineSize ?? entry.contentRect.width),
            blockSize: centi(box?.blockSize ?? entry.contentRect.height)
          });
        }
      });
      observer.observe(element);
    }

    let mutations: MutationObserver | undefined;
    if (typeof MutationObserver !== 'undefined' && content && !isDrawer) {
      mutations = new MutationObserver(() => syncChildOrder());
      mutations.observe(content, { childList: true });
    }

    let dragActive = false;
    const axisDelta = (delta: { dx: number; dy: number }): number =>
      horizontal ? delta.dx : delta.dy;
    /**
     * Snap, from ANY drag source: siblings after the dragged pane shift
     * rigidly during a solo drag, so the row's LAST visible pane's trailing
     * edge moves 1:1 with the delta. When that edge lands within
     * SNAP_TOLERANCE of the container's far edge, the draft locks onto the
     * exact fit and the lock renders on that last pane's handle.
     */
    const applyDraftDelta = (deltaPx: number): void => {
      const draft = state.interaction;
      if (
        !parentSolo ||
        !element ||
        draft?.kind !== 'resize' ||
        draft.beforeId !== props.id ||
        !draft.solo
      ) {
        state.updateResize(deltaPx);
        return;
      }
      const container = element.parentElement;
      if (!container) {
        state.updateResize(deltaPx);
        return;
      }
      const framesInRow = container.querySelectorAll<HTMLElement>(
        ':scope > [data-wheel-frame][data-frame-visible="true"]'
      );
      const lastElement = framesInRow[framesInRow.length - 1];
      const lastId = lastElement?.getAttribute('data-wheel-frame');
      if (!lastElement || !lastId) {
        state.updateResize(deltaPx);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const lastRect = lastElement.getBoundingClientRect();
      // While the tail actively absorbs (rendered wider than its starting
      // width), the row is attached by construction — snap chrome there
      // would be constant noise, not an event.
      const absorbing =
        draft.tailAbsorb !== null &&
        (horizontal ? lastRect.width : lastRect.height) >
          draft.tailAbsorb.basePx + 0.5;
      // Live rects already include the currently applied draft delta.
      const fitDelta = horizontal
        ? containerRect.right - lastRect.right + draft.deltaPx
        : containerRect.bottom - lastRect.bottom + draft.deltaPx;
      if (
        !absorbing &&
        Math.abs(deltaPx - fitDelta) <= SNAP_TOLERANCE &&
        fitDelta >= draft.minDelta &&
        fitDelta <= draft.maxDelta
      ) {
        state.updateResize(fitDelta, lastId);
      } else {
        state.updateResize(deltaPx, null);
      }
    };
    const gesture = handle
      ? createGesture(handle, {
          disabled: () => !handleVisible(),
          onDraft: (delta) => {
            if (!dragActive) {
              const next = state.nextSibling;
              if (next === null && !parentSolo) return;
              state.beginResize(props.id, next);
              dragActive = true;
            }
            applyDraftDelta(axisDelta(delta));
          },
          onCommit: (delta) => {
            if (dragActive) {
              applyDraftDelta(axisDelta(delta));
              state.commitResize();
              dragActive = false;
            }
          },
          onCancel: () => {
            state.cancelResize();
            dragActive = false;
          },
          onDoubleClick: () => {
            if (!handleVisible()) return;
            state.resetPair(props.id, state.nextSibling ?? props.id);
          }
        })
      : null;

    const dragPointer = (delta: { x: number; y: number }): number =>
      horizontal ? delta.x : delta.y;
    const dragGesture =
      props.draggable && parent?.reorderable && element && !isDrawer
        ? createGesture(element, {
            slop: 6,
            shouldStart: (event) => {
              const target = event.target as HTMLElement | null;
              if (!target || !element) return false;
              if (target.closest('[data-wheel-frame-handle]')) return false;
              // A press inside a nested frame belongs to that frame.
              if (target.closest('[data-wheel-frame]') !== element) return false;
              const grip = target.closest('[data-frame-grip]');
              if (grip) return element.contains(grip);
              if (element.querySelector('[data-frame-grip]')) return false;
              return (
                target.closest(
                  'button, a, input, textarea, select, [contenteditable="true"]'
                ) === null
              );
            },
            onDraft: (delta) => {
              setDraggingReorder(true);
              parent.previewReorder(props.id, dragPointer(delta));
            },
            onCommit: (delta) => {
              setDraggingReorder(false);
              parent.commitReorder(props.id, dragPointer(delta));
            },
            onCancel: () => {
              setDraggingReorder(false);
              parent.previewReorder(props.id, null);
            }
          })
        : null;

    onCleanup(() => {
      gesture?.dispose();
      dragGesture?.dispose();
      observer?.disconnect();
      mutations?.disconnect();
      disposeAdopt?.();
      state.unregisterFrame(props.id);
    });
  });

  return (
    <div
      ref={element}
      use:componentRoot
      class={props.class}
      data-wheel-frame={props.id}
      data-frame-kind={props.kind}
      data-frame-open={open() ? 'true' : 'false'}
      data-frame-visible={visible() ? 'true' : 'false'}
      data-frame-dragging={draggingReorder() ? 'true' : undefined}
      role={isDrawer ? 'region' : undefined}
      aria-label={isDrawer ? props.label : undefined}
      aria-hidden={visible() ? undefined : 'true'}
      inert={visible() ? undefined : true}
      style={trackStyle()}
    >
      <div ref={content} data-wheel-frame-content={props.id} style={contentStyle()}>
        <FrameParentContext.Provider value={isDrawer ? null : context}>
          {props.children}
        </FrameParentContext.Provider>
        <div style={reorderIndicatorStyle()} />
      </div>
      <Show when={props.scrollable}>
        {(scrollAxis) => (
          <Scrollbar
            container={() => content}
            axis={scrollAxis()}
            label={`Scroll ${props.id}`}
          />
        )}
      </Show>
      <div
        ref={handle}
        role="separator"
        tabindex={handleVisible() ? 0 : -1}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-label={`Resize ${props.id}`}
        aria-valuenow={measuredExtent() ?? undefined}
        aria-valuemin={minPixels()}
        aria-valuemax={maxPixels() ?? undefined}
        data-wheel-frame-handle={props.id}
        data-state={
          dragSnapped()
            ? 'snapped'
            : trailingDragged()
              ? 'dragging'
              : hovered()
                ? 'hover'
                : 'idle'
        }
        style={handleStyle()}
        onKeyDown={handleKeyDown}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <div style={dividerStyle()} />
        <Show when={dragSnapped()}>
          <div data-wheel-frame-snap-lock style={snapLockStyle()}>
            🔒
          </div>
        </Show>
      </div>
    </div>
  );
}

/** Split children left to right; resize handles appear between siblings. */
export function FrameRow(props: FrameSplitProps): JSX.Element {
  return <FrameShell {...props} kind="row" />;
}

/** Split children top to bottom; resize handles appear between siblings. */
export function FrameColumn(props: FrameSplitProps): JSX.Element {
  return <FrameShell {...props} kind="column" />;
}

/** A pull-over overlay panel; sits above content instead of pushing it. */
export function FrameDrawer(props: FrameDrawerProps): JSX.Element {
  return <FrameShell {...props} kind="drawer" />;
}
