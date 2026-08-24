/**
 * The transport: play/stop, tempo, undo/redo, and who else is here.
 *
 * Two things in this small file are worth reading closely.
 *
 * 1. PLAY IS THE USER GESTURE. `play()` is reached from this click and from
 *    the space bar, and nowhere else — building the AudioContext anywhere
 *    earlier is what trips a browser's autoplay policy.
 * 2. THE TEMPO FIELD HAS A FLUSH HOOK. Typing "14" on the way to "140" must
 *    not fire three mutations, so the field holds a DRAFT and commits on
 *    Enter or blur. That leaves a window where what you see is not yet a
 *    mutation — so undo flushes the draft first, through
 *    `registerFlushHook`, exactly as the editor demo does for uncommitted
 *    keystrokes. Without it, mod+z after typing would silently undo the
 *    thing before the tempo change.
 */
import { onCleanup } from 'solid-js';
import Play from 'lucide-solid/icons/play';
import Redo2 from 'lucide-solid/icons/redo-2';
import Square from 'lucide-solid/icons/square';
import Undo2 from 'lucide-solid/icons/undo-2';
import { componentRoot, connect, useSignal, view } from 'wheel/core';
import { Button } from 'wheel/components';

import { MAX_BPM, MIN_BPM } from '../audio/scheduler';
import { SequencerService } from '../services/sequencer-service';
import { TransportService } from '../services/transport-service';
import styles from '../sequencer.module.css';

const connectSequencerToolbar = connect('SequencerToolbar', (c) => {
  const sequencerService = c.service(SequencerService);
  const transportService = c.service(TransportService);
  return view(
    {
      bpm: sequencerService.bpm,
      canUndo: sequencerService.canUndo,
      canRedo: sequencerService.canRedo,
      peerCount: sequencerService.peerCount,
      playingPeerCount: sequencerService.playingPeerCount,
      playing: transportService.playing
    },
    {
      toggleTransport: transportService.toggle,
      setBpm: sequencerService.setBpm,
      undo: sequencerService.undo,
      redo: sequencerService.redo,
      registerFlushHook: (hook: () => void) => sequencerService.registerFlushHook(hook)
    }
  );
});

/** The stage toolbar: transport, tempo, history, peers. */
export function SequencerToolbar() {
  const state = connectSequencerToolbar({});
  const [draftBpm, setDraftBpm] = useSignal<string | null>(null, 'draftBpm');

  /** Turn whatever is in the field into a mutation, or into nothing. */
  const commitBpm = (): void => {
    const draft = draftBpm();
    setDraftBpm(null);
    const parsed = draft === null ? Number.NaN : Number(draft);
    if (Number.isFinite(parsed)) {
      state.setBpm(parsed);
    }
  };

  // Undo must see the typed tempo as a mutation, not as a half-finished
  // field, so it flushes through this hook before inverting anything.
  const unregister = state.registerFlushHook(commitBpm);
  onCleanup(() => {
    unregister();
    commitBpm();
  });

  return (
    <span use:componentRoot class={styles.controls}>
      <Button
        class={styles.transportButton}
        data-testid="sequencer-play"
        data-playing={state.playing ? 'true' : 'false'}
        title={state.playing ? 'Stop (space)' : 'Play (space)'}
        onClick={() => void state.toggleTransport()}
      >
        {state.playing ? <Square size={13} /> : <Play size={13} />}
        {state.playing ? 'Stop' : 'Play'}
      </Button>

      <label class={styles.bpmField}>
        <span class={styles.bpmLabel}>bpm</span>
        <input
          type="number"
          class={styles.bpmInput}
          data-testid="sequencer-bpm"
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          value={draftBpm() ?? String(state.bpm)}
          onInput={(event) => setDraftBpm(event.currentTarget.value)}
          onChange={commitBpm}
          onBlur={commitBpm}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
      </label>

      <Button
        class={styles.iconButton}
        title="Undo (mod+z)"
        data-testid="sequencer-undo"
        disabled={!state.canUndo}
        onClick={state.undo}
      >
        <Undo2 size={14} />
      </Button>
      <Button
        class={styles.iconButton}
        title="Redo (mod+shift+z)"
        data-testid="sequencer-redo"
        disabled={!state.canRedo}
        onClick={state.redo}
      >
        <Redo2 size={14} />
      </Button>

      <span class={styles.readout} data-testid="sequencer-peer-count" data-count={state.peerCount}>
        {state.peerCount === 1 ? '1 peer' : `${state.peerCount} peers`}
      </span>
      <span
        class={styles.readout}
        data-testid="sequencer-playing-peers"
        data-count={state.playingPeerCount}
      >
        {state.playingPeerCount} playing
      </span>
    </span>
  );
}
