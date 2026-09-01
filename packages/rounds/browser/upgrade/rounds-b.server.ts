import { sql } from 'wheel/sync';
import { serveQuery } from 'wheel/sync/server';

import * as roundsServerA from '../../src/sync/rounds.server';
import { ROUNDS_B_SYNC_MODULES, itemsByChecklist } from './rounds-b.sync';

const itemsByChecklistServer = serveQuery({
  query: itemsByChecklist,
  sql: (params) =>
    sql`select id, checklist_id as "checklistId", label, status, note, revision, position,
               null as "auditCode"
        from items where checklist_id = ${params.checklistId} order by position, id`
});

/** Contract B reuses every binding except its changed item row query. */
export const ROUNDS_B_SERVERS = [{ ...roundsServerA, itemsByChecklistServer }] as const;

/** Source input for the generated Contract B fingerprint. */
export const ROUNDS_B_SCHEMA_SPEC_INPUT = {
  syncModules: [...ROUNDS_B_SYNC_MODULES],
  servers: [...ROUNDS_B_SERVERS]
};
