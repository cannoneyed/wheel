import * as chalkSync from '../editor/sync/editor.sync';

/** Client-safe declarations shared by Chalk browser and servers. */
export const CHALK_SYNC_MODULES = [chalkSync] as const;
