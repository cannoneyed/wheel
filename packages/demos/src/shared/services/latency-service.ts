/**
 * The simulated-latency setting as a service: components read/set it through
 * connect() like all state; the transport wrapper reads the plain ref.
 */
import { Service } from 'wheel/core';
import { simulatedLatency } from '../utils/simulated-latency';

/** Read/write the tab's simulated round-trip latency. */
export class LatencyService extends Service {
  /** Current simulated latency in ms. Connect directly (`view({ ms: svc.ms })`). */
  readonly ms = this.atom(simulatedLatency.ms, 'ms');

  /** Set the latency (applies to every wire call and pushed event, this tab only). */
  readonly set = this.action((ms: number) => {
    simulatedLatency.ms = ms;
    this.ms.set(ms);
  }, 'set');
}
