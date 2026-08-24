/** The simulated-latency selector (per tab; see simulated-latency.ts). */
import { For } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { LatencyService } from '../services/latency-service';
import styles from './connection.module.css';

const LATENCY_STEPS = [0, 100, 500, 2000] as const;

const connectLatencyControl = connect('LatencyControl', (c) => {
  const latencyService = c.service(LatencyService);
  return view({ ms: latencyService.ms }, { set: latencyService.set });
});

/** Label + select for the tab's simulated round-trip latency. */
export function LatencyControl() {
  const state = connectLatencyControl({});
  return (
    <label use:componentRoot class={styles.latency}>
      latency
      <select value={String(state.ms)} onChange={(event) => state.set(Number(event.currentTarget.value))}>
        <For each={[...LATENCY_STEPS]}>
          {(ms) => <option value={String(ms)}>{ms === 0 ? 'none' : `${ms}ms`}</option>}
        </For>
      </select>
    </label>
  );
}
