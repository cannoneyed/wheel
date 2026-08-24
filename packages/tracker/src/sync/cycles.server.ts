/**
 * Server bindings for cycles: two read-only queries (no mutations — cycles
 * are managed by the seed and the rollover job through externalWrite).
 */
import { sql } from 'wheel/sync';
import { serveQuery } from 'wheel/sync/server/cloudflare';
import { cycleStatsByTeam, cyclesByTeam } from './cycles.sync';

/** DDL for the cycles table (cycle_stats is virtual — no DDL). */
export const CYCLES_DDL = [
  `create table if not exists cycles (
     id text primary key,
     team_id text not null,
     number integer not null,
     starts_at bigint not null,
     ends_at bigint not null)`,
  `create index if not exists cycles_team_idx on cycles (team_id, number desc)`
];

/** cycles.byTeam — newest first. */
export const cyclesByTeamServer = serveQuery({
  query: cyclesByTeam,
  sql: (params) =>
    sql`select id, team_id as "teamId", number, starts_at as "startsAt", ends_at as "endsAt"
        from cycles where team_id = ${params.teamId}
        order by number desc, id`,
  rerunOn: ['cycles']
});

/** cycle_stats.byTeam — derived progress per cycle (virtual; watch list only). */
export const cycleStatsByTeamServer = serveQuery({
  query: cycleStatsByTeam,
  sql: (params) =>
    sql`select c.id as "cycleId",
               count(i.id) as scope,
               count(i.id) filter (where ws.type = 'started') as started,
               count(i.id) filter (where ws.type in ('completed', 'canceled')) as completed
        from cycles c
        left join issues i on i.cycle_id = c.id and i.archived_at is null
        left join workflow_states ws on ws.id = i.state_id
        where c.team_id = ${params.teamId}
        group by c.id
        order by c.id`,
  rerunOn: ['cycles', 'issues', 'workflow_states']
});
