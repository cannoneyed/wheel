// wheel-view-root: framework scrollbar chrome — a scrollbar is a detail of
// its scrolling pane, not a component anyone selects or debugs in the tree
// wheel-raw-signal: same reason — with no view root registered, a named
// signal would be recorded against the nearest registered ancestor, which is
// some unrelated app component
import { createSignal, onCleanup, onMount, type JSX } from 'solid-js';

import { createGesture } from './gesture-dom';

/** Live scroll metrics along one axis of a container. */
export interface ScrollMetrics {
  /** Visible extent (client size). */
  readonly viewport: number;
  /** Full scrollable extent (scroll size). */
  readonly content: number;
  /** Current scroll position. */
  readonly offset: number;
}

/**
 * Thumb geometry from scroll metrics — pure, so the sizing rules are unit
 * testable: thumb length is the visible fraction of the track (clamped to a
 * usable minimum), thumb position is the scrolled fraction of what remains.
 * Null when nothing overflows.
 */
export function thumbGeometry(
  track: number,
  metrics: ScrollMetrics,
  minThumb = 24
): { readonly size: number; readonly offset: number } | null {
  if (track <= 0 || metrics.content <= metrics.viewport + 1) return null;
  const size = Math.min(
    track,
    Math.max(minThumb, (track * metrics.viewport) / metrics.content)
  );
  const range = track - size;
  const scrollRange = metrics.content - metrics.viewport;
  return {
    size,
    offset: scrollRange > 0 ? (range * metrics.offset) / scrollRange : 0
  };
}

/** Props for the framework-managed scrollbar. */
export interface ScrollbarProps {
  /** The scrolling element; read lazily so a sibling ref can arrive first. */
  readonly container: () => HTMLElement | null | undefined;
  readonly axis?: 'x' | 'y';
  /** Accessible name; defaults to "Scrollbar". */
  readonly label?: string;
  readonly class?: string;
}

const KEY_STEP = 48;

/**
 * A permanent, framework-drawn scrollbar bound to one scroll container.
 *
 * It tracks the container's metrics through scroll events plus resize and
 * mutation observers on the container AND its children, so the thumb grows
 * and shrinks as panes are added, removed, or resized. The thumb drags
 * through the same gesture machine as every other Wheel drag (Escape puts
 * the scroll position back), the track pages on press, and the keyboard
 * scrolls a focused bar.
 *
 * It renders as an in-flow gutter: place it after (axis `x`) or beside
 * (axis `y`) the scroll container in a flex parent and it takes real layout
 * space while something overflows, disappearing entirely otherwise —
 * `Frame`'s `scrollable` prop does exactly that wiring.
 *
 * Theme via CSS custom properties: `--wheel-scrollbar-size`,
 * `--wheel-scrollbar-track`, `--wheel-scrollbar-thumb`, and
 * `--wheel-scrollbar-thumb-active`.
 */
export function Scrollbar(props: ScrollbarProps): JSX.Element {
  const horizontal = (props.axis ?? 'x') === 'x';
  const [metrics, setMetrics] = createSignal<ScrollMetrics>({
    viewport: 0,
    content: 0,
    offset: 0
  });
  const [trackPx, setTrackPx] = createSignal(0);
  const [dragging, setDragging] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);

  let track: HTMLDivElement | undefined;
  let thumb: HTMLDivElement | undefined;

  const update = (): void => {
    const container = props.container();
    if (!container) return;
    const next: ScrollMetrics = horizontal
      ? {
          viewport: container.clientWidth,
          content: container.scrollWidth,
          offset: container.scrollLeft
        }
      : {
          viewport: container.clientHeight,
          content: container.scrollHeight,
          offset: container.scrollTop
        };
    setMetrics((previous) =>
      previous.viewport === next.viewport &&
      previous.content === next.content &&
      previous.offset === next.offset
        ? previous
        : next
    );
    if (track) {
      setTrackPx(horizontal ? track.clientWidth : track.clientHeight);
    }
  };

  const overflowing = (): boolean =>
    metrics().content > metrics().viewport + 1;
  const geometry = (): { size: number; offset: number } | null =>
    thumbGeometry(trackPx(), metrics());

  const scrollTo = (offset: number): void => {
    const container = props.container();
    if (!container) return;
    const limit = Math.max(0, metrics().content - metrics().viewport);
    const clamped = Math.max(0, Math.min(limit, offset));
    if (horizontal) container.scrollLeft = clamped;
    else container.scrollTop = clamped;
  };

  const scrollBy = (delta: number): void => scrollTo(metrics().offset + delta);

  const handleKeyDown = (event: KeyboardEvent): void => {
    const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
    let delta: number | null = null;
    if (event.key === decrease) delta = -KEY_STEP;
    else if (event.key === increase) delta = KEY_STEP;
    else if (event.key === 'PageUp') delta = -metrics().viewport;
    else if (event.key === 'PageDown') delta = metrics().viewport;
    else if (event.key === 'Home') delta = -metrics().content;
    else if (event.key === 'End') delta = metrics().content;
    if (delta === null) return;
    event.preventDefault();
    scrollBy(delta);
  };

  // DOM ownership boundary: metric observation, wheel forwarding, and both
  // gestures need the mounted container and bar elements; every listener and
  // observer disconnects on cleanup.
  onMount(() => {
    const container = props.container();
    if (!container || !track || !thumb) return;
    const trackElement = track;
    const thumbElement = thumb;

    container.addEventListener('scroll', update, { passive: true });
    const forwardWheel = (event: WheelEvent): void => {
      const delta = horizontal
        ? event.deltaX || event.deltaY
        : event.deltaY;
      if (delta !== 0) {
        event.preventDefault();
        scrollBy(delta);
      }
    };
    trackElement.addEventListener('wheel', forwardWheel, { passive: false });

    let observer: ResizeObserver | undefined;
    let childObserver: ResizeObserver | undefined;
    let mutations: MutationObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(container);
      observer.observe(trackElement);
      // The container's scroll size changes when CHILDREN resize, which the
      // container's own box never reports — so children get their own
      // observer, re-collected whenever the child list changes.
      childObserver = new ResizeObserver(update);
      const observeChildren = (): void => {
        childObserver!.disconnect();
        for (const child of container.children) childObserver!.observe(child);
        update();
      };
      observeChildren();
      if (typeof MutationObserver !== 'undefined') {
        mutations = new MutationObserver(observeChildren);
        // Subtree, not just direct children: a transient absolutely-positioned
        // descendant (a drag badge, an indicator) can change scroll overflow
        // without any observed child ever resizing.
        mutations.observe(container, { childList: true, subtree: true });
      }
    }
    update();

    let dragOrigin: number | null = null;
    const thumbGesture = createGesture(thumbElement, {
      slop: 0,
      onDraft: (delta) => {
        if (dragOrigin === null) dragOrigin = metrics().offset;
        setDragging(true);
        const shape = geometry();
        if (!shape) return;
        const range = trackPx() - shape.size;
        if (range <= 0) return;
        const scrollRange = metrics().content - metrics().viewport;
        const along = horizontal ? delta.dx : delta.dy;
        scrollTo(dragOrigin + (along * scrollRange) / range);
      },
      onCommit: () => {
        dragOrigin = null;
        setDragging(false);
      },
      onCancel: () => {
        // Escape restores where the user started, like every Wheel drag.
        if (dragOrigin !== null) scrollTo(dragOrigin);
        dragOrigin = null;
        setDragging(false);
      }
    });

    const pageOnPress = (event: PointerEvent): void => {
      if (event.target !== trackElement) return;
      const rect = trackElement.getBoundingClientRect();
      const at = horizontal ? event.clientX - rect.left : event.clientY - rect.top;
      const shape = geometry();
      if (!shape) return;
      const direction = at < shape.offset ? -1 : at > shape.offset + shape.size ? 1 : 0;
      if (direction !== 0) scrollBy(direction * metrics().viewport * 0.9);
    };
    trackElement.addEventListener('pointerdown', pageOnPress);

    onCleanup(() => {
      container.removeEventListener('scroll', update);
      trackElement.removeEventListener('wheel', forwardWheel);
      trackElement.removeEventListener('pointerdown', pageOnPress);
      observer?.disconnect();
      childObserver?.disconnect();
      mutations?.disconnect();
      thumbGesture.dispose();
    });
  });

  /**
   * The bar is an in-flow gutter, not an overlay: while something overflows
   * it takes real layout space beside the content, and `display: none`
   * releases that space the moment the overflow goes away.
   */
  const trackStyle = (): JSX.CSSProperties => {
    if (!overflowing()) return { display: 'none' };
    const size = 'var(--wheel-scrollbar-size, 8px)';
    const shared: JSX.CSSProperties = {
      position: 'relative',
      flex: '0 0 auto',
      'border-radius': '999px',
      background:
        hovered() || dragging()
          ? 'var(--wheel-scrollbar-track, rgba(128, 128, 128, 0.12))'
          : 'transparent',
      'touch-action': 'none'
    };
    return horizontal
      ? { ...shared, height: size, margin: '2px 4px' }
      : { ...shared, width: size, margin: '4px 2px' };
  };

  const thumbStyle = (): JSX.CSSProperties => {
    const shape = geometry();
    if (!shape) return { display: 'none' };
    const paint =
      dragging() || hovered()
        ? 'var(--wheel-scrollbar-thumb-active, rgba(148, 163, 184, 0.85))'
        : 'var(--wheel-scrollbar-thumb, rgba(148, 163, 184, 0.45))';
    const shared: JSX.CSSProperties = {
      position: 'absolute',
      'border-radius': '999px',
      background: paint,
      transition: 'background 90ms ease'
    };
    return horizontal
      ? {
          ...shared,
          top: '0',
          bottom: '0',
          left: `${shape.offset}px`,
          width: `${shape.size}px`
        }
      : {
          ...shared,
          left: '0',
          right: '0',
          top: `${shape.offset}px`,
          height: `${shape.size}px`
        };
  };

  const percent = (): number => {
    const scrollRange = metrics().content - metrics().viewport;
    if (scrollRange <= 0) return 0;
    return Math.round((metrics().offset / scrollRange) * 100);
  };

  return (
    <div
      ref={track}
      role="scrollbar"
      tabindex={overflowing() ? 0 : -1}
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent()}
      aria-label={props.label ?? 'Scrollbar'}
      data-wheel-scrollbar={horizontal ? 'x' : 'y'}
      data-state={dragging() ? 'dragging' : hovered() ? 'hover' : 'idle'}
      class={props.class}
      style={trackStyle()}
      onKeyDown={handleKeyDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div ref={thumb} data-wheel-scrollbar-thumb style={thumbStyle()} />
    </div>
  );
}
