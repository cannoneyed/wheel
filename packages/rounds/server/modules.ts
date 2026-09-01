import * as roundsServer from '../src/sync/rounds.server';
import { ROUNDS_SYNC_MODULES } from '../src/sync/modules';

export { ROUNDS_SYNC_MODULES };

/** Rounds server bindings shared by production and browser-test runtimes. */
export const ROUNDS_SERVERS = [roundsServer] as const;

/** Input for checked-in schema and row-fingerprint generation. */
export const ROUNDS_SCHEMA_SPEC_INPUT = {
  syncModules: [...ROUNDS_SYNC_MODULES],
  servers: [...ROUNDS_SERVERS]
};
