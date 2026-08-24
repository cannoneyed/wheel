import { assign, createActor, setup, type ActorRefFrom } from 'xstate';

/** Modifier-key state carried with every gesture sample. */
export interface GestureModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
}

/** One drag sample: displacement from the press origin, absolute position, and live modifiers. */
export interface GestureDelta {
  readonly dx: number;
  readonly dy: number;
  /** Absolute pointer position (origin plus displacement) for hit testing. */
  readonly x: number;
  readonly y: number;
  readonly modifiers: GestureModifiers;
}

/** Semantic outputs of the gesture machine; every callback is optional. */
export interface GestureCallbacks {
  /** The gesture claimed a pointer; the adapter should capture it. */
  readonly onCapture?: (pointerId: number) => void;
  /** The gesture released its pointer; the adapter should release capture. */
  readonly onRelease?: (pointerId: number) => void;
  /** Press and release without crossing the slop threshold. */
  readonly onClick?: (modifiers: GestureModifiers) => void;
  /** A drag is in flight; fired on every accepted move and modifier change. */
  readonly onDraft?: (delta: GestureDelta) => void;
  /** The drag ended normally; apply the final delta exactly once. */
  readonly onCommit?: (delta: GestureDelta) => void;
  /** The drag ended abnormally; discard the draft. */
  readonly onCancel?: () => void;
}

/** Static configuration for one gesture actor. */
export interface GestureInput {
  /** Movement in CSS pixels required before a press becomes a drag. */
  readonly slop?: number;
  readonly callbacks: GestureCallbacks;
}

/** Events the DOM adapter (or a test script) feeds into the machine. */
export type GestureEvent =
  | {
      readonly type: 'pointer.down';
      readonly pointerId: number;
      readonly x: number;
      readonly y: number;
      readonly modifiers: GestureModifiers;
    }
  | {
      readonly type: 'pointer.move';
      readonly pointerId: number;
      readonly x: number;
      readonly y: number;
      readonly modifiers: GestureModifiers;
    }
  | {
      readonly type: 'pointer.up';
      readonly pointerId: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: 'pointer.cancel'; readonly pointerId: number }
  | { readonly type: 'pointer.extra'; readonly pointerId: number }
  | { readonly type: 'modifiers'; readonly modifiers: GestureModifiers }
  | { readonly type: 'escape' }
  | { readonly type: 'blur' };

interface GestureContext {
  readonly slop: number;
  readonly callbacks: GestureCallbacks;
  readonly pointerId: number | null;
  readonly originX: number;
  readonly originY: number;
  readonly dx: number;
  readonly dy: number;
  readonly modifiers: GestureModifiers;
}

/** No modifiers pressed; the initial machine state. */
export const NO_MODIFIERS: GestureModifiers = {
  shift: false,
  alt: false,
  ctrl: false,
  meta: false
};

const DEFAULT_SLOP = 4;

function delta(context: GestureContext): GestureDelta {
  return {
    dx: context.dx,
    dy: context.dy,
    x: context.originX + context.dx,
    y: context.originY + context.dy,
    modifiers: context.modifiers
  };
}

function samePointer(
  context: GestureContext,
  event: { readonly pointerId: number }
): boolean {
  return context.pointerId === event.pointerId;
}

/**
 * The pure pointer-gesture statechart shared by every Wheel drag interaction.
 *
 * `idle → pressed → dragging` with explicit outcomes for every abnormal event:
 * Escape, `pointercancel`, capture loss, a second pointer, and window blur all
 * cancel a drag; releasing before the slop threshold is a click, never a drag.
 * The machine owns every decision; DOM side effects live in the adapter.
 */
export const gestureMachine = setup({
  types: {
    context: {} as GestureContext,
    events: {} as GestureEvent,
    input: {} as GestureInput
  },
  guards: {
    samePointer: ({ context, event }) =>
      'pointerId' in event && samePointer(context, event),
    crossedSlop: ({ context, event }) => {
      if (event.type !== 'pointer.move' || !samePointer(context, event)) {
        return false;
      }
      return (
        Math.hypot(event.x - context.originX, event.y - context.originY) >
        context.slop
      );
    }
  },
  actions: {
    begin: assign(({ event }) => {
      if (event.type !== 'pointer.down') return {};
      return {
        pointerId: event.pointerId,
        originX: event.x,
        originY: event.y,
        dx: 0,
        dy: 0,
        modifiers: event.modifiers
      };
    }),
    trackMove: assign(({ context, event }) => {
      if (event.type !== 'pointer.move') return {};
      return {
        dx: event.x - context.originX,
        dy: event.y - context.originY,
        modifiers: event.modifiers
      };
    }),
    trackRelease: assign(({ context, event }) => {
      if (event.type !== 'pointer.up') return {};
      return {
        dx: event.x - context.originX,
        dy: event.y - context.originY
      };
    }),
    trackModifiers: assign(({ event }) =>
      event.type === 'modifiers' ? { modifiers: event.modifiers } : {}
    ),
    clearPointer: assign({ pointerId: null }),
    capture: ({ context }) => {
      if (context.pointerId !== null) {
        context.callbacks.onCapture?.(context.pointerId);
      }
    },
    release: ({ context }) => {
      if (context.pointerId !== null) {
        context.callbacks.onRelease?.(context.pointerId);
      }
    },
    emitClick: ({ context }) => {
      context.callbacks.onClick?.(context.modifiers);
    },
    emitDraft: ({ context }) => {
      context.callbacks.onDraft?.(delta(context));
    },
    emitCommit: ({ context }) => {
      context.callbacks.onCommit?.(delta(context));
    },
    emitCancel: ({ context }) => {
      context.callbacks.onCancel?.();
    }
  }
}).createMachine({
  id: 'gesture',
  context: ({ input }) => ({
    slop: input.slop ?? DEFAULT_SLOP,
    callbacks: input.callbacks,
    pointerId: null,
    originX: 0,
    originY: 0,
    dx: 0,
    dy: 0,
    modifiers: NO_MODIFIERS
  }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        'pointer.down': {
          target: 'pressed',
          actions: ['begin', 'capture']
        }
      }
    },
    pressed: {
      on: {
        'pointer.move': [
          {
            guard: 'crossedSlop',
            target: 'dragging',
            actions: ['trackMove', 'emitDraft']
          },
          {
            guard: 'samePointer',
            actions: 'trackMove'
          }
        ],
        'pointer.up': {
          guard: 'samePointer',
          target: 'idle',
          actions: ['release', 'emitClick', 'clearPointer']
        },
        'pointer.cancel': {
          guard: 'samePointer',
          target: 'idle',
          actions: ['release', 'clearPointer']
        },
        'pointer.extra': {
          target: 'idle',
          actions: ['release', 'clearPointer']
        },
        modifiers: { actions: 'trackModifiers' },
        escape: {
          target: 'idle',
          actions: ['release', 'clearPointer']
        },
        blur: {
          target: 'idle',
          actions: ['release', 'clearPointer']
        }
      }
    },
    dragging: {
      on: {
        'pointer.move': {
          guard: 'samePointer',
          actions: ['trackMove', 'emitDraft']
        },
        modifiers: { actions: ['trackModifiers', 'emitDraft'] },
        'pointer.up': {
          guard: 'samePointer',
          target: 'idle',
          actions: ['trackRelease', 'release', 'emitCommit', 'clearPointer']
        },
        'pointer.cancel': {
          guard: 'samePointer',
          target: 'idle',
          actions: ['release', 'emitCancel', 'clearPointer']
        },
        'pointer.extra': {
          target: 'idle',
          actions: ['release', 'emitCancel', 'clearPointer']
        },
        escape: {
          target: 'idle',
          actions: ['release', 'emitCancel', 'clearPointer']
        },
        blur: {
          target: 'idle',
          actions: ['release', 'emitCancel', 'clearPointer']
        }
      }
    }
  }
});

/** A running gesture actor; `send` events, read `getSnapshot().value`. */
export type GestureActor = ActorRefFrom<typeof gestureMachine>;

/** Start one gesture actor with the given slop and callbacks. */
export function createGestureActor(input: GestureInput): GestureActor {
  const actor = createActor(gestureMachine, { input });
  actor.start();
  return actor;
}
