import * as chalkServer from '../src/editor/sync/editor.server';
import { CHALK_SYNC_MODULES } from '../src/sync/modules';

export { CHALK_SYNC_MODULES };

/** Chalk server bindings shared by SQLite and Durable Objects. */
export const CHALK_SERVERS = [chalkServer] as const;

/** Input for checked-in schema and row-fingerprint generation. */
export const CHALK_SCHEMA_SPEC_INPUT = {
  syncModules: [...CHALK_SYNC_MODULES],
  servers: [...CHALK_SERVERS]
};
