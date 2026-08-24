// @vitest-environment node
/** The drag machine is pure — every path is a table of (state, event) checks. */
import { describe, expect, test } from 'vitest';

import { DRAG_IDLE, DRAG_THRESHOLD, dragTransition, type DragState } from './drag-machine';

const press: DragState = { kind: 'pressed', issueId: 'issue_1', startX: 10, startY: 10 };

describe('drag machine', () => {
  test('press arms; sub-threshold movement stays pressed (still a click)', () => {
    const armed = dragTransition(DRAG_IDLE, { kind: 'press', issueId: 'issue_1', x: 10, y: 10 });
    expect(armed.state).toEqual(press);
    const wiggle = dragTransition(armed.state, {
      kind: 'move',
      x: 10 + DRAG_THRESHOLD - 1,
      y: 10,
      target: null
    });
    expect(wiggle.state.kind).toBe('pressed');
  });

  test('release before threshold is a click: idle, no drop', () => {
    const result = dragTransition(press, { kind: 'release' });
    expect(result.state).toEqual(DRAG_IDLE);
    expect(result.drop).toBeUndefined();
  });

  test('crossing the threshold starts dragging and tracks the target', () => {
    const dragging = dragTransition(press, { kind: 'move', x: 30, y: 10, target: { stateId: 'state_a', index: 2 } });
    expect(dragging.state).toEqual({
      kind: 'dragging',
      issueId: 'issue_1',
      x: 30,
      y: 10,
      over: { stateId: 'state_a', index: 2 }
    });
    const moved = dragTransition(dragging.state, { kind: 'move', x: 40, y: 20, target: { stateId: 'state_b', index: 0 } });
    expect(moved.state).toEqual({
      kind: 'dragging',
      issueId: 'issue_1',
      x: 40,
      y: 20,
      over: { stateId: 'state_b', index: 0 }
    });
  });

  test('release over a target drops; release over nothing does not', () => {
    const over = dragTransition(press, { kind: 'move', x: 30, y: 10, target: { stateId: 'state_a', index: 1 } });
    const dropped = dragTransition(over.state, { kind: 'release' });
    expect(dropped.state).toEqual(DRAG_IDLE);
    expect(dropped.drop).toEqual({ issueId: 'issue_1', target: { stateId: 'state_a', index: 1 } });

    const nowhere = dragTransition(over.state, { kind: 'move', x: 5, y: 5, target: null });
    const released = dragTransition(nowhere.state, { kind: 'release' });
    expect(released.drop).toBeUndefined();
  });

  test('cancel resets from every state', () => {
    expect(dragTransition(DRAG_IDLE, { kind: 'cancel' }).state).toEqual(DRAG_IDLE);
    expect(dragTransition(press, { kind: 'cancel' }).state).toEqual(DRAG_IDLE);
    const dragging = dragTransition(press, { kind: 'move', x: 50, y: 50, target: null });
    expect(dragTransition(dragging.state, { kind: 'cancel' }).state).toEqual(DRAG_IDLE);
  });
});
