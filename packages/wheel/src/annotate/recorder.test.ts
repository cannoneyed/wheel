// @vitest-environment jsdom
/**
 * The recorder is the part that could quietly ruin an app: it sits in the two
 * hottest paths in the kernel (every action, every atom write). These tests
 * hold the line on all five promises —
 *
 *  - with no tap installed, nothing is recorded and nothing changes;
 *  - an action and a state change arrive NAMED, not as anonymous mutations;
 *  - an action is listed BEFORE the writes it caused;
 *  - a frame-rate atom collapses into one entry instead of hundreds;
 *  - a big object is stored as the keys that changed, not twice over.
 */
import { describe, expect, it } from 'vitest';

import { Service, ServiceContext } from '../core/services';
import { setWheelTap } from '../core/recorder-tap';

import { Recorder, stateTreeSnapshot } from './recorder';
import type { RecordedState } from './types';

class BoardService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'BoardService';

  readonly selection = this.atom<readonly string[]>([], 'selection');
  readonly board = this.atom<{ name: string; cells: number }>({ name: 'a', cells: 0 }, 'board');
  readonly toggleCell = this.action((cellId: string) => {
    this.selection.set([cellId]);
  }, 'toggleCell');
  readonly rename = this.action((name: string) => {
    this.board.update((draft) => {
      draft.name = name;
    });
  }, 'rename');
}

/** A context whose clock the test drives by hand. */
function harness(): {
  context: ServiceContext;
  board: BoardService;
  recorder: Recorder;
  tick: (ms: number) => void;
} {
  let clock = 1_000;
  const context = new ServiceContext({ clock: { now: () => clock } });
  const recorder = new Recorder({ now: () => clock, registry: context.registry });
  return {
    context,
    board: context.get(BoardService),
    recorder,
    tick: (ms: number) => {
      clock += ms;
    }
  };
}

describe('Recorder', () => {
  it('records nothing while no tap is installed', () => {
    const { board, recorder } = harness();
    board.toggleCell('3-7');
    expect(board.selection.get()).toEqual(['3-7']);
    expect(recorder.timeline()).toHaveLength(0);
    setWheelTap(null);
  });

  it('names the action and the state change it caused, cause first', () => {
    const { board, recorder } = harness();
    recorder.install({ input: false, network: false });
    board.toggleCell('3-7');
    recorder.uninstall();

    const [action, state] = recorder.timeline();
    expect(action).toMatchObject({
      kind: 'action',
      service: 'BoardService',
      action: 'toggleCell',
      args: ['3-7']
    });
    expect(state).toMatchObject({
      kind: 'state',
      service: 'BoardService',
      atom: 'selection',
      from: [],
      to: ['3-7']
    });
  });

  it('ignores a write that changes nothing', () => {
    const { board, recorder } = harness();
    recorder.install({ input: false, network: false });
    board.selection.set(board.selection.get());
    recorder.uninstall();
    expect(recorder.timeline().filter((event) => event.kind === 'state')).toHaveLength(0);
  });

  it('collapses frame-rate writes to one atom into a single counted entry', () => {
    const { board, recorder, tick } = harness();
    recorder.install({ input: false, network: false });
    for (let frame = 0; frame < 50; frame += 1) {
      board.selection.set([`cell-${frame}`]);
      tick(8);
    }
    recorder.uninstall();

    const states = recorder.timeline().filter((event): event is RecordedState => event.kind === 'state');
    expect(states).toHaveLength(1);
    expect(states[0]!.count).toBe(50);
    expect(states[0]!.from).toEqual([]);
    expect(states[0]!.to).toEqual(['cell-49']);
  });

  it('coalesces across the actions that drive them — the real drag shape', () => {
    const { board, recorder, tick } = harness();
    recorder.install({ input: false, network: false });
    board.rename('b');
    tick(10);
    board.rename('c');
    recorder.uninstall();

    const state = recorder.timeline().find((event): event is RecordedState => event.kind === 'state')!;
    expect(state.changed).toEqual({ name: { from: 'a', to: 'c' } });
    expect(state.count).toBe(2);
  });

  it('refuses a merge that would erase the change', () => {
    const { board, recorder, tick } = harness();
    recorder.install({ input: false, network: false });
    // A value that leaves and comes back inside the window: merging would
    // print `[] -> []`, which reads as "nothing happened".
    board.selection.set(['a']);
    tick(10);
    board.selection.set([]);
    recorder.uninstall();

    const states = recorder.timeline().filter((event): event is RecordedState => event.kind === 'state');
    expect(states).toHaveLength(2);
    expect(states[0]!.to).toEqual(['a']);
    expect(states[1]!.to).toEqual([]);
  });

  it('places an action after the input that ran it and before the writes it caused', () => {
    const { board, recorder } = harness();
    recorder.install({ network: false });

    // One millisecond on the fake clock holds all three, which is exactly the
    // case the ordering rule exists for: the click is the CAUSE of the action,
    // and the atom write is its EFFECT.
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.addEventListener('click', () => board.toggleCell('3-7'));
    button.click();
    recorder.uninstall();
    button.remove();

    const kinds = recorder.timeline().map((event) => event.kind);
    expect(kinds).toEqual(['input', 'action', 'state']);
  });

  it('separates writes that are far enough apart to be different moments', () => {
    const { board, recorder, tick } = harness();
    recorder.install({ input: false, network: false });
    board.selection.set(['a']);
    tick(500);
    board.selection.set(['b']);
    recorder.uninstall();
    expect(recorder.timeline().filter((event) => event.kind === 'state')).toHaveLength(2);
  });

  it('stores an object change as the keys that moved, not two whole copies', () => {
    const { board, recorder } = harness();
    recorder.install({ input: false, network: false });
    board.rename('renamed');
    recorder.uninstall();

    const state = recorder.timeline().find((event): event is RecordedState => event.kind === 'state')!;
    expect(state.changed).toEqual({ name: { from: 'a', to: 'renamed' } });
    expect(state.from).toBeUndefined();
    expect(state.to).toBeUndefined();
  });

  it('starts a recording empty, so the last one is not in this one', () => {
    const { board, recorder } = harness();
    recorder.install({ input: false, network: false });
    recorder.startClip();
    board.toggleCell('first-recording');
    recorder.endClip();

    // Pressing record means "from here". A buffer carried over would put the
    // previous recording's events at the top of this note.
    recorder.startClip();
    board.toggleCell('second-recording');
    recorder.uninstall();

    const args = recorder.timeline().flatMap((event) => (event.kind === 'action' ? event.args : []));
    expect(args).toContain('second-recording');
    expect(args).not.toContain('first-recording');
  });

  it('keeps a long recording whole', () => {
    const { board, recorder, tick } = harness();
    recorder.install({ input: false, network: false });
    recorder.startClip();
    board.toggleCell('old');
    tick(90_000);
    board.toggleCell('new');
    recorder.uninstall();

    expect(recorder.timeline().some((event) => event.at === 1_000)).toBe(true);
  });

  it('stays bounded during a long clip without re-copying the buffer per write', () => {
    const { board, recorder, tick } = harness();
    recorder.install({ input: false, network: false });
    recorder.startClip();
    // Past the hard cap. The buffer used to re-slice itself on EVERY write
    // once full, which measured 17µs per action; a head pointer keeps the
    // bound exact and the compaction amortized.
    for (let i = 0; i < 25_000; i += 1) {
      board.selection.set([`cell-${i}`]);
      tick(200);
    }
    recorder.uninstall();

    const timeline = recorder.timeline();
    expect(timeline.length).toBeLessThanOrEqual(20_000);
    // The newest events survive; the oldest are the ones dropped.
    expect(timeline[timeline.length - 1]).toMatchObject({ to: ['cell-24999'] });
  });

  it('merges harvested streams into one time-ordered slice', () => {
    const { board, recorder, tick } = harness();
    recorder.install({ input: false, network: false });
    recorder.startClip();
    board.toggleCell('3-7');
    tick(200);
    recorder.uninstall();

    const merged = recorder.harvest(0, 10_000, [
      { at: 1_100, kind: 'write', collection: 'cells', rowId: '3-7', cause: 'optimistic:toggle' }
    ]);
    expect(merged.map((event) => event.kind)).toEqual(['action', 'state', 'write']);
    expect(merged.every((event, index) => index === 0 || event.at >= merged[index - 1]!.at)).toBe(true);
  });
});

describe('stateTreeSnapshot', () => {
  it('captures every service atom keyed by service — the half replay would need', () => {
    const { board, context } = harness();
    board.toggleCell('3-7');
    expect(stateTreeSnapshot(context.registry)['BoardService']).toMatchObject({
      selection: ['3-7'],
      board: { name: 'a', cells: 0 }
    });
  });

  it('leaves actions out — they are the door, not the state', () => {
    const { context } = harness();
    context.get(BoardService);
    expect(stateTreeSnapshot(context.registry)['BoardService']).not.toHaveProperty('toggleCell');
  });
});
