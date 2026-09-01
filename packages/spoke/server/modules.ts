import * as spokeServer from '../src/sync/spoke.server';
import { SPOKE_SYNC_MODULES } from '../src/sync/modules';

export { SPOKE_SYNC_MODULES };

/** Spoke server bindings shared by every backend. */
export const SPOKE_SERVERS = [spokeServer] as const;

/** Input for checked-in schema and row-fingerprint generation. */
export const SPOKE_SCHEMA_SPEC_INPUT = {
  syncModules: [...SPOKE_SYNC_MODULES],
  servers: [...SPOKE_SERVERS]
};
