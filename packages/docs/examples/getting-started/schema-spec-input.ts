import * as todosServer from './todos.server';
import * as todosSync from './todos.sync';

/** Build-time input for the generated browser and server row fingerprint. */
export const GETTING_STARTED_SCHEMA_SPEC_INPUT = {
  syncModules: [todosSync],
  servers: [todosServer]
};
