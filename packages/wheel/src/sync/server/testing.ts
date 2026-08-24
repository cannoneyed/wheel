/**
 * `wheel/sync/server/testing` — the runtime-neutral backend conformance
 * contract. Consumers provide their test runner and backend harness.
 */
export {
  runBackendConformance,
  type ConformanceHarness,
  type ConformanceTestApi
} from './backends/conformance';
