/**
 * The mixer beside the grid: one row per lane with its name, its level, and a
 * button that empties it.
 *
 * Two deliberate choices live here:
 *
 *  - CLEAR IS ONE UNDO STEP. The button fires a single `tracks.clear`
 *    mutation that turns off up to sixteen rows, and its inverse carries all
 *    of them back — so one mod+z restores the whole lane, not one cell at a
 *    time. Same bulk-inverse shape as the graph demo's delete-with-cascade.
 *  - THE FADER IS NOT UNDOABLE, and it commits on release rather than on
 *    every pixel of the drag: one mutation per gesture. The reasoning is
 *    written where the mutation is declared (sequencer.sync.ts).
 */
import { For } from 'solid-js';
import Eraser from 'lucide-solid/icons/eraser';
import { componentRoot, connect, view } from 'wheel/core';
import { Button, Input } from 'wheel/components';

import { SequencerService } from '../services/sequencer-service';
import styles from '../sequencer.module.css';

const connectSequencerTracks = connect('SequencerTracks', (c) => {
  const sequencerService = c.service(SequencerService);
  return view(
    {
      lanes: sequencerService.lanes,
      trackCount: sequencerService.trackCount,
      activeCount: sequencerService.activeCount
    },
    {
      renameTrack: sequencerService.renameTrack,
      setGain: sequencerService.setGain,
      clearTrack: sequencerService.clearTrack
    }
  );
});

/** Per-lane name, level and clear — the grid's instrument panel. */
export function SequencerTracks() {
  const state = connectSequencerTracks({});

  return (
    <aside use:componentRoot class={styles.sidebar} data-testid="sequencer-tracks">
      <p class={styles.counts} data-testid="sequencer-counts">
        {state.trackCount} tracks · <span data-testid="sequencer-active-count">{state.activeCount}</span> steps on
      </p>

      <For each={state.lanes}>
        {(lane) => (
          <div class={styles.trackRow} data-testid={`sequencer-track-${lane.voice}`}>
            <Input data-wheel-role="sequencer-name"
              type="text"
              class={styles.trackName}
              data-testid={`sequencer-name-${lane.voice}`}
              value={lane.name}
              aria-label={`${lane.voice} track name`}
              onChange={(event) => state.renameTrack(lane.id, event.currentTarget.value)}
            />
            <div class={styles.trackControls}>
              <input
                type="range"
                class={styles.gain}
                data-testid={`sequencer-gain-${lane.voice}`}
                min={0}
                max={100}
                step={5}
                value={Math.round(lane.gain * 100)}
                aria-label={`${lane.name} level`}
                // `change`, not `input`: one mutation when the fader is let
                // go, rather than one per pixel of the drag.
                onChange={(event) => state.setGain(lane.id, Number(event.currentTarget.value) / 100)}
              />
              <Button data-wheel-role="sequencer-clear"
                class={styles.clearButton}
                data-testid={`sequencer-clear-${lane.voice}`}
                title={`Clear ${lane.name} (one undo step)`}
                onClick={() => state.clearTrack(lane.id)}
              >
                <Eraser size={13} />
              </Button>
            </div>
          </div>
        )}
      </For>
    </aside>
  );
}
