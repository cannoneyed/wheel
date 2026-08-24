import { describe, expect, it, vi } from 'vitest';

import {
  createGestureActor,
  NO_MODIFIERS,
  type GestureActor,
  type GestureCallbacks,
  type GestureModifiers
} from './gesture';

const SHIFT: GestureModifiers = { ...NO_MODIFIERS, shift: true };

interface Harness {
  readonly actor: GestureActor;
  readonly calls: string[];
  readonly spies: Required<GestureCallbacks>;
}

function harness(slop?: number): Harness {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(
        args.length === 0 ? name : `${name}:${JSON.stringify(args[0])}`
      );
    };
  const spies: Required<GestureCallbacks> = {
    onCapture: vi.fn(record('capture')),
    onRelease: vi.fn(record('release')),
    onClick: vi.fn(record('click')),
    onDraft: vi.fn(record('draft')),
    onCommit: vi.fn(record('commit')),
    onCancel: vi.fn(record('cancel'))
  };
  return { actor: createGestureActor({ slop, callbacks: spies }), calls, spies };
}

function down(actor: GestureActor, x = 100, y = 100, pointerId = 1): void {
  actor.send({ type: 'pointer.down', pointerId, x, y, modifiers: NO_MODIFIERS });
}

function move(
  actor: GestureActor,
  x: number,
  y: number,
  pointerId = 1,
  modifiers = NO_MODIFIERS
): void {
  actor.send({ type: 'pointer.move', pointerId, x, y, modifiers });
}

function up(actor: GestureActor, x = 100, y = 100, pointerId = 1): void {
  actor.send({ type: 'pointer.up', pointerId, x, y });
}

describe('gesture machine', () => {
  it('press and release below slop is a click, never a drag', () => {
    const { actor, spies } = harness();
    down(actor);
    move(actor, 102, 101);
    up(actor, 102, 101);
    expect(spies.onClick).toHaveBeenCalledTimes(1);
    expect(spies.onDraft).not.toHaveBeenCalled();
    expect(spies.onCommit).not.toHaveBeenCalled();
    expect(spies.onCancel).not.toHaveBeenCalled();
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('captures on press and releases on every outcome', () => {
    const { actor, spies } = harness();
    down(actor);
    expect(spies.onCapture).toHaveBeenCalledWith(1);
    up(actor);
    expect(spies.onRelease).toHaveBeenCalledWith(1);
  });

  it('movement at the slop boundary stays a press; past it becomes a drag', () => {
    const { actor, spies } = harness(4);
    down(actor);
    move(actor, 104, 100);
    expect(actor.getSnapshot().value).toBe('pressed');
    expect(spies.onDraft).not.toHaveBeenCalled();
    move(actor, 105, 100);
    expect(actor.getSnapshot().value).toBe('dragging');
    expect(spies.onDraft).toHaveBeenLastCalledWith({
      dx: 5,
      dy: 0,
      x: 105,
      y: 100,
      modifiers: NO_MODIFIERS
    });
  });

  it('commits exactly once with the delta of the release position', () => {
    const { actor, spies } = harness();
    down(actor);
    move(actor, 140, 90);
    up(actor, 150, 80);
    expect(spies.onCommit).toHaveBeenCalledTimes(1);
    expect(spies.onCommit).toHaveBeenCalledWith({
      dx: 50,
      dy: -20,
      x: 150,
      y: 80,
      modifiers: NO_MODIFIERS
    });
    expect(spies.onClick).not.toHaveBeenCalled();
    expect(spies.onCancel).not.toHaveBeenCalled();
  });

  it.each([
    ['escape', { type: 'escape' } as const],
    ['pointer cancel', { type: 'pointer.cancel', pointerId: 1 } as const],
    ['second pointer', { type: 'pointer.extra', pointerId: 2 } as const],
    ['window blur', { type: 'blur' } as const]
  ])('%s mid-drag cancels without committing', (_name, event) => {
    const { actor, spies } = harness();
    down(actor);
    move(actor, 150, 100);
    actor.send(event);
    expect(spies.onCancel).toHaveBeenCalledTimes(1);
    expect(spies.onCommit).not.toHaveBeenCalled();
    expect(spies.onRelease).toHaveBeenCalledWith(1);
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it.each([
    ['escape', { type: 'escape' } as const],
    ['pointer cancel', { type: 'pointer.cancel', pointerId: 1 } as const],
    ['second pointer', { type: 'pointer.extra', pointerId: 2 } as const],
    ['window blur', { type: 'blur' } as const]
  ])('%s before the slop threshold aborts silently', (_name, event) => {
    const { actor, spies } = harness();
    down(actor);
    actor.send(event);
    expect(spies.onClick).not.toHaveBeenCalled();
    expect(spies.onCancel).not.toHaveBeenCalled();
    expect(spies.onCommit).not.toHaveBeenCalled();
    expect(spies.onRelease).toHaveBeenCalledWith(1);
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('ignores moves and releases from a different pointer', () => {
    const { actor, spies } = harness();
    down(actor);
    move(actor, 200, 200, 7);
    up(actor, 200, 200, 7);
    expect(actor.getSnapshot().value).toBe('pressed');
    expect(spies.onDraft).not.toHaveBeenCalled();
    expect(spies.onClick).not.toHaveBeenCalled();
  });

  it('re-emits the draft with the same delta when modifiers change mid-drag', () => {
    const { actor, spies } = harness();
    down(actor);
    move(actor, 150, 100);
    actor.send({ type: 'modifiers', modifiers: SHIFT });
    expect(spies.onDraft).toHaveBeenLastCalledWith({
      dx: 50,
      dy: 0,
      x: 150,
      y: 100,
      modifiers: SHIFT
    });
    up(actor, 150, 100);
    expect(spies.onCommit).toHaveBeenCalledWith({
      dx: 50,
      dy: 0,
      x: 150,
      y: 100,
      modifiers: SHIFT
    });
  });

  it('a click reports modifiers tracked while pressed', () => {
    const { actor, spies } = harness();
    down(actor);
    actor.send({ type: 'modifiers', modifiers: SHIFT });
    up(actor);
    expect(spies.onClick).toHaveBeenCalledWith(SHIFT);
  });

  it('is reusable after a commit and after a cancel', () => {
    const { actor, spies, calls } = harness();
    down(actor);
    move(actor, 150, 100);
    up(actor, 150, 100);
    down(actor);
    move(actor, 90, 100);
    actor.send({ type: 'escape' });
    down(actor);
    up(actor);
    expect(spies.onCommit).toHaveBeenCalledTimes(1);
    expect(spies.onCancel).toHaveBeenCalledTimes(1);
    expect(spies.onClick).toHaveBeenCalledTimes(1);
    expect(calls.filter((entry) => entry.startsWith('capture'))).toHaveLength(3);
    expect(calls.filter((entry) => entry.startsWith('release'))).toHaveLength(3);
  });

  it('runs a full torture script without double outcomes', () => {
    const { actor, spies } = harness();
    const outcomes = (): number[] => [
      spies.onClick.mock.calls.length,
      spies.onCommit.mock.calls.length,
      spies.onCancel.mock.calls.length
    ];
    down(actor);
    move(actor, 130, 100);
    move(actor, 131, 100, 7);
    actor.send({ type: 'modifiers', modifiers: SHIFT });
    actor.send({ type: 'pointer.extra', pointerId: 3 });
    expect(outcomes()).toEqual([0, 0, 1]);
    actor.send({ type: 'escape' });
    up(actor);
    expect(outcomes()).toEqual([0, 0, 1]);
    down(actor);
    move(actor, 60, 100);
    up(actor, 55, 100);
    expect(outcomes()).toEqual([0, 1, 1]);
    expect(spies.onCommit).toHaveBeenCalledWith({
      dx: -45,
      dy: 0,
      x: 55,
      y: 100,
      modifiers: NO_MODIFIERS
    });
  });
});
