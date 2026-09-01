import * as roundsSync from './rounds.sync';

/** Client-safe declarations shared by Rounds browser and servers. */
export const ROUNDS_SYNC_MODULES = [roundsSync] as const;
