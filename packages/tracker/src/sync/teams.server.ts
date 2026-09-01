/**
 * Server bindings for the workspace foundation. Handlers mirror the
 * optimistic handlers in teams.sync.ts.
 */
import { sql } from 'wheel/sync';
import { serveMutation, serveQuery } from 'wheel/sync/server/cloudflare';
import { statesByTeam, teamUpdate, teamsAll, usersAll } from './teams.sync';

/**
 * DDL for the foundation tables (the seed lives in seed/seed.ts, shared with
 * Worlds). SQLite dialect: `estimates_enabled` is an `integer` boolean (0/1;
 * the backend coerces it back to a real boolean at its read seam), positions
 * are `real`.
 */
export const TEAMS_DDL = [
  `create table if not exists users (
     id text primary key,
     name text not null,
     initials text not null,
     avatar_color text not null)`,
  `create table if not exists teams (
     id text primary key,
     name text not null,
     key text not null unique,
     color text not null,
     icon text not null,
     cycle_length_weeks integer not null default 2,
     estimates_enabled integer not null default 1,
     position real not null default 0)`,
  `create table if not exists workflow_states (
     id text primary key,
     team_id text not null,
     name text not null,
     type text not null,
     color text not null,
     position real not null default 0)`
];

export const usersAllServer = serveQuery({
  query: usersAll,
  sql: () => sql`select id, name, initials, avatar_color as "avatarColor" from users order by name`
});

export const teamsAllServer = serveQuery({
  query: teamsAll,
  sql: () => sql`select id, name, key, color, icon,
                        cycle_length_weeks as "cycleLengthWeeks",
                        estimates_enabled as "estimatesEnabled",
                        position
                 from teams order by position`
});

export const statesByTeamServer = serveQuery({
  query: statesByTeam,
  sql: (params) => sql`select id, team_id as "teamId", name, type, color, position
                       from workflow_states where team_id = ${params.teamId}
                       order by position`
});

export const teamUpdateServer = serveMutation({
  mutation: teamUpdate,
  handler: async (tx, args) => {
    const patch = args.patch;
    if (patch.name !== undefined) await tx.sql`update teams set name = ${patch.name} where id = ${args.teamId}`;
    if (patch.color !== undefined) await tx.sql`update teams set color = ${patch.color} where id = ${args.teamId}`;
    if (patch.cycleLengthWeeks !== undefined)
      await tx.sql`update teams set cycle_length_weeks = ${patch.cycleLengthWeeks} where id = ${args.teamId}`;
    if (patch.estimatesEnabled !== undefined)
      await tx.sql`update teams set estimates_enabled = ${patch.estimatesEnabled} where id = ${args.teamId}`;
  }
});
