/**
 * The grid: sixteen steps across, one lane per voice, and a moving highlight
 * that follows the audio clock.
 *
 * WHY THIS IS PLAIN DOM AND NOT A CANVAS. The imperative core of this demo is
 * the AUDIO, not the pixels — sixty-four buttons is a job the browser already
 * does well, and keeping them as real elements means every claim the demo
 * makes is inspectable: a test can click a cell, read its velocity, and watch
 * `data-step` advance. The one thing a headless browser can never check is
 * whether it made a sound, which is exactly why the timing lives in
 * `audio/scheduler.ts` as a pure function with its own unit tests.
 *
 * The playhead is a DATA MIRROR, not a second clock. The engine calls
 * `onStep` at step boundaries; TransportService puts that number in an atom;
 * this component renders it. Nothing here polls, and nothing here knows what
 * an AudioContext is.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { Button } from 'wheel/components';

import { SequencerService, cellKey, type LaneCell } from '../services/sequencer-service';
import { TransportService } from '../services/transport-service';
import { STEP_COUNT } from '../sync/sequencer.sync';
import styles from '../sequencer.module.css';

/** Every step index, once, for the ruler above the grid. */
const STEP_INDICES = [...Array(STEP_COUNT).keys()];

const connectSequencerGrid = connect('SequencerGrid', (c) => {
  const sequencerService = c.service(SequencerService);
  const transportService = c.service(TransportService);
  return view(
    {
      lanes: sequencerService.lanes,
      status: () => sequencerService.steps.status,
      peerCells: sequencerService.peerCells,
      currentStep: transportService.step,
      audioBlocked: transportService.audioBlocked
    },
    {
      toggleStep: sequencerService.toggleStep,
      cycleVelocity: sequencerService.cycleVelocity,
      publishTouch: sequencerService.publishTouch
    }
  );
});

/** Which of the three velocity bands a cell sits in, for the CSS. */
function velocityBand(cell: LaneCell): string {
  if (!cell.on) {
    return 'off';
  }
  return cell.velocity >= 0.9 ? 'accent' : cell.velocity >= 0.55 ? 'normal' : 'ghost';
}

/** The step grid, its ruler, and the peer rings drawn on top of it. */
export function SequencerGrid() {
  const state = connectSequencerGrid({});

  return (
    <div use:componentRoot class={styles.gridWrap}>
      <Show when={state.status.kind === 'loading' && state.lanes.length === 0}>
        <span class="stale-note">loading… (first boot with no cache and no server waits here)</span>
      </Show>

      <div
        class={styles.grid}
        data-testid="sequencer-grid"
        data-step={state.currentStep}
        onPointerLeave={() => state.publishTouch(null, null)}
      >
        <span class={styles.rulerCorner} />
        <For each={STEP_INDICES}>
          {(index) => (
            <span
              class={styles.rulerTick}
              data-testid={`sequencer-tick-${index}`}
              data-current={index === state.currentStep ? 'true' : 'false'}
              data-beat={index % 4 === 0 ? 'true' : 'false'}
            >
              {index % 4 === 0 ? index / 4 + 1 : '·'}
            </span>
          )}
        </For>

        <For each={state.lanes}>
          {(lane) => (
            <>
              <span class={styles.laneName} data-testid={`sequencer-lane-${lane.voice}`}>
                {lane.name}
              </span>
              <For each={lane.cells}>
                {(cell) => (
                  <Button data-wheel-role="sequencer-cell"
                    class={styles.cell}
                    data-testid={`sequencer-cell-${lane.voice}-${cell.index}`}
                    data-on={cell.on ? 'true' : 'false'}
                    data-velocity={velocityBand(cell)}
                    data-beat={cell.index % 4 === 0 ? 'true' : 'false'}
                    data-current={cell.index === state.currentStep ? 'true' : 'false'}
                    data-peer={state.peerCells[cellKey(lane.id, cell.index)] === undefined ? 'false' : 'true'}
                    style={{ '--sequencer-peer': state.peerCells[cellKey(lane.id, cell.index)] ?? 'transparent' }}
                    title={`${lane.name} · step ${cell.index + 1} — click to toggle, shift-click for velocity`}
                    aria-pressed={cell.on}
                    onPointerEnter={() => state.publishTouch(lane.id, cell.index)}
                    onClick={(event) => {
                      state.publishTouch(lane.id, cell.index);
                      // One gesture, one mutation, one undo step — the shift
                      // variant included (velocity carries `on` in its args).
                      if (event.shiftKey) {
                        state.cycleVelocity(cell.id);
                      } else {
                        state.toggleStep(cell.id);
                      }
                    }}
                  />
                )}
              </For>
            </>
          )}
        </For>
      </div>

      <Show when={state.audioBlocked}>
        <p class={styles.blocked} data-testid="sequencer-audio-blocked">
          The browser is holding audio back until you interact with the page — press play again.
        </p>
      </Show>

      <p class={styles.hint}>
        Click a step to toggle it, shift-click to cycle its velocity. The pattern and the tempo
        sync; the playhead does not — every listener needs their own gesture to start audio, so two
        windows keep independent playheads over one shared pattern.
      </p>
    </div>
  );
}
