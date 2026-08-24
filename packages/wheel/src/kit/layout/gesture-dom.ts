import {
  createGestureActor,
  NO_MODIFIERS,
  type GestureActor,
  type GestureDelta,
  type GestureModifiers
} from './gesture';

/** Configuration for one DOM-bound gesture. */
export interface CreateGestureOptions {
  /** Movement in CSS pixels required before a press becomes a drag. */
  readonly slop?: number;
  /** A drag is in flight; batched to one call per animation frame. */
  readonly onDraft?: (delta: GestureDelta) => void;
  /** The drag ended normally; apply the final delta exactly once. */
  readonly onCommit?: (delta: GestureDelta) => void;
  /** The drag ended abnormally (Escape, capture loss, second pointer, blur). */
  readonly onCancel?: () => void;
  /** Press and release without crossing the slop threshold. */
  readonly onClick?: (modifiers: GestureModifiers) => void;
  /** Native double click on the element; drags never suppress it. */
  readonly onDoubleClick?: () => void;
  /** Checked at pointer-down; a disabled gesture ignores the press. */
  readonly disabled?: () => boolean;
  /** Per-press filter; return false to let the press pass through untouched. */
  readonly shouldStart?: (event: PointerEvent) => boolean;
}

/** A bound gesture; dispose removes every listener and stops the actor. */
export interface GestureHandle {
  readonly dispose: () => void;
  /** True while a press or drag is in flight. */
  readonly active: () => boolean;
}

function modifiersOf(event: {
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}): GestureModifiers {
  return {
    shift: event.shiftKey,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey
  };
}

/**
 * Bind the gesture machine to one element with Pointer Events.
 *
 * The adapter owns only side effects: pointer capture, listener lifetime,
 * animation-frame move batching, and text-selection suppression during a
 * drag. Every decision — slop, cancellation, modifiers, click-vs-drag —
 * happens inside the machine, so the same torture cases covered by the
 * machine's unit tests are the cases this element exhibits.
 */
export function createGesture(
  element: HTMLElement,
  options: CreateGestureOptions
): GestureHandle {
  let capturedPointerId: number | null = null;
  let pendingMove: PointerEvent | null = null;
  let moveFrame: number | null = null;
  let savedUserSelect: string | null = null;

  const actor: GestureActor = createGestureActor({
    slop: options.slop,
    callbacks: {
      onCapture: (pointerId) => {
        capturedPointerId = pointerId;
        try {
          element.setPointerCapture?.(pointerId);
        } catch {
          // jsdom and detached elements have no capturable pointer.
        }
        element.addEventListener('pointermove', handleMove);
        element.addEventListener('pointerup', handleUp);
        element.addEventListener('pointercancel', handleCancel);
        element.addEventListener('lostpointercapture', handleCaptureLoss);
        window.addEventListener('keydown', handleKey, true);
        window.addEventListener('keyup', handleKey, true);
        window.addEventListener('blur', handleBlur);
      },
      onRelease: (pointerId) => {
        try {
          element.releasePointerCapture?.(pointerId);
        } catch {
          // Capture may already be gone; release must never throw.
        }
        element.removeEventListener('pointermove', handleMove);
        element.removeEventListener('pointerup', handleUp);
        element.removeEventListener('pointercancel', handleCancel);
        element.removeEventListener('lostpointercapture', handleCaptureLoss);
        window.removeEventListener('keydown', handleKey, true);
        window.removeEventListener('keyup', handleKey, true);
        window.removeEventListener('blur', handleBlur);
        if (savedUserSelect !== null) {
          document.body.style.userSelect = savedUserSelect;
          savedUserSelect = null;
        }
        capturedPointerId = null;
        pendingMove = null;
        if (moveFrame !== null) {
          cancelAnimationFrame(moveFrame);
          moveFrame = null;
        }
      },
      onClick: options.onClick,
      onDraft: (delta) => {
        // Selection is suppressed only once a real drag starts, so ordinary
        // presses and clicks on the element never disturb text selection.
        if (savedUserSelect === null) {
          savedUserSelect = document.body.style.userSelect;
          document.body.style.userSelect = 'none';
        }
        options.onDraft?.(delta);
      },
      onCommit: options.onCommit,
      onCancel: options.onCancel
    }
  });

  const flushMove = (): void => {
    moveFrame = null;
    const event = pendingMove;
    pendingMove = null;
    if (!event) return;
    actor.send({
      type: 'pointer.move',
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      modifiers: modifiersOf(event)
    });
  };

  const handleDown = (event: PointerEvent): void => {
    if (options.disabled?.()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (options.shouldStart && !options.shouldStart(event)) return;
    if (capturedPointerId !== null) {
      if (event.pointerId !== capturedPointerId) {
        actor.send({ type: 'pointer.extra', pointerId: event.pointerId });
      }
      return;
    }
    event.preventDefault();
    actor.send({
      type: 'pointer.down',
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      modifiers: modifiersOf(event)
    });
  };

  const handleMove = (event: PointerEvent): void => {
    if (event.pointerId !== capturedPointerId) return;
    pendingMove = event;
    moveFrame ??= requestAnimationFrame(flushMove);
  };

  const handleUp = (event: PointerEvent): void => {
    if (event.pointerId !== capturedPointerId) return;
    if (pendingMove) flushMove();
    actor.send({
      type: 'pointer.up',
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    });
  };

  const handleCancel = (event: PointerEvent): void => {
    actor.send({ type: 'pointer.cancel', pointerId: event.pointerId });
  };

  const handleCaptureLoss = (event: PointerEvent): void => {
    actor.send({ type: 'pointer.cancel', pointerId: event.pointerId });
  };

  const handleKey = (event: KeyboardEvent): void => {
    if (event.type === 'keydown' && event.key === 'Escape') {
      event.stopPropagation();
      actor.send({ type: 'escape' });
      return;
    }
    actor.send({ type: 'modifiers', modifiers: modifiersOf(event) });
  };

  const handleBlur = (): void => {
    actor.send({ type: 'blur' });
  };

  const handleDoubleClick = (): void => {
    options.onDoubleClick?.();
  };

  element.addEventListener('pointerdown', handleDown);
  if (options.onDoubleClick) {
    element.addEventListener('dblclick', handleDoubleClick);
  }

  return {
    active: () => actor.getSnapshot().value !== 'idle',
    dispose: () => {
      if (capturedPointerId !== null) {
        actor.send({ type: 'pointer.cancel', pointerId: capturedPointerId });
      }
      element.removeEventListener('pointerdown', handleDown);
      element.removeEventListener('dblclick', handleDoubleClick);
      actor.stop();
    }
  };
}

/** Re-export the pure machine surface beside its adapter. */
export { NO_MODIFIERS };
