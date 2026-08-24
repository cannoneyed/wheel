/**
 * Board drag as an explicit hand-written state machine (settled question Q3:
 * hand-rolled, deliberately shaped as the motivating brief for a future
 * `machine()` kernel primitive).
 *
 * Pure data in, pure data out: the component feeds pointer events through
 * `dragTransition` and renders whatever state comes back. No DOM in here —
 * hit-testing happens at the edge (the board component) and arrives as a
 * ready-made `DropTarget`.
 *
 *   idle ──press──▶ pressed ──move>threshold──▶ dragging ──release──▶ idle (+drop)
 *                      │                            │
 *                   release (click)              cancel/escape
 *                      ▼                            ▼
 *                    idle                         idle
 */

/** Where a dragging card would land: a column and an index within it. */
export interface DropTarget {
  readonly stateId: string;
  readonly index: number;
}

/** The machine's states. `pressed` is pre-threshold (still maybe a click). */
export type DragState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pressed'; readonly issueId: string; readonly startX: number; readonly startY: number }
  | {
      readonly kind: 'dragging';
      readonly issueId: string;
      readonly x: number;
      readonly y: number;
      readonly over: DropTarget | null;
    };

/** The machine's events, fed from pointer listeners. */
export type DragMachineEvent =
  | { readonly kind: 'press'; readonly issueId: string; readonly x: number; readonly y: number }
  | { readonly kind: 'move'; readonly x: number; readonly y: number; readonly target: DropTarget | null }
  | { readonly kind: 'release' }
  | { readonly kind: 'cancel' };

/** A transition's result: the next state, plus a drop effect when one fired. */
export interface DragTransition {
  readonly state: DragState;
  /** Present exactly when a drag released over a target. */
  readonly drop?: { readonly issueId: string; readonly target: DropTarget };
}

/** Pointer travel (px) that turns a press into a drag instead of a click. */
export const DRAG_THRESHOLD = 4;

/** The machine's initial state. */
export const DRAG_IDLE: DragState = { kind: 'idle' };

/** The whole machine: (state, event) → (state, effect). Pure. */
export function dragTransition(state: DragState, event: DragMachineEvent): DragTransition {
  if (event.kind === 'cancel') return { state: DRAG_IDLE };
  switch (state.kind) {
    case 'idle':
      if (event.kind === 'press') {
        return { state: { kind: 'pressed', issueId: event.issueId, startX: event.x, startY: event.y } };
      }
      return { state };
    case 'pressed':
      if (event.kind === 'move') {
        const travel = Math.hypot(event.x - state.startX, event.y - state.startY);
        if (travel < DRAG_THRESHOLD) return { state };
        return {
          state: { kind: 'dragging', issueId: state.issueId, x: event.x, y: event.y, over: event.target }
        };
      }
      // Release before the threshold is a plain click — the caller's click
      // handler owns it; the machine just resets.
      return { state: DRAG_IDLE };
    case 'dragging':
      if (event.kind === 'move') {
        return { state: { ...state, x: event.x, y: event.y, over: event.target } };
      }
      if (event.kind === 'release') {
        return {
          state: DRAG_IDLE,
          drop: state.over ? { issueId: state.issueId, target: state.over } : undefined
        };
      }
      return { state };
  }
}
