/**
 * Server bindings for projects. The `project_counts` derived query is the
 * first physical-table-free handler: its SQL derives rows from issues +
 * workflow_states, and invalidation comes from the shared dependency list.
 */
import { sql } from 'wheel/sync';
import { serveMutation, serveQuery } from 'wheel/sync/server/cloudflare';
import {
  projectCountsAll,
  projectCreate,
  projectDelete,
  projectUpdate,
  projectsAll
} from './projects.sync';

/** DDL for the projects table (`project_counts` has no matching table). */
export const PROJECTS_DDL = [
  `create table if not exists projects (
     id text primary key,
     name text not null,
     description text not null default '',
     status_kind text not null default 'planned',
     lead_id text,
     target_date text,
     position real not null default 0)`
];

/** projects.all — sidebar order. */
export const projectsAllServer = serveQuery({
  query: projectsAll,
  sql: () =>
    sql`select id, name, description, status_kind as "statusKind",
               lead_id as "leadId", target_date as "targetDate", position
        from projects order by position, id`
});

/** project_counts.all — derived progress per project through declared dependencies. */
export const projectCountsAllServer = serveQuery({
  query: projectCountsAll,
  sql: () =>
    sql`select i.project_id as "projectId",
               count(*) as total,
               count(*) filter (where ws.type in ('completed', 'canceled')) as completed
        from issues i
        join workflow_states ws on ws.id = i.state_id
        where i.project_id is not null and i.archived_at is null
        group by i.project_id
        order by i.project_id`
});

/** projects.create — upsert (redo replay may see the row). */
export const projectCreateServer = serveMutation({
  mutation: projectCreate,
  handler: async (tx, args) => {
    await tx.sql`insert into projects (id, name, description, status_kind, lead_id, target_date, position)
                 values (${args.projectId}, ${args.name}, ${args.description}, 'planned',
                         ${args.leadId}, ${args.targetDate}, ${args.position})
                 on conflict (id) do update set
                   name = excluded.name, description = excluded.description,
                   lead_id = excluded.lead_id, target_date = excluded.target_date`;
  }
});

/** projects.update — field-by-field patch. */
export const projectUpdateServer = serveMutation({
  mutation: projectUpdate,
  handler: async (tx, args) => {
    const patch = args.patch;
    if (patch.name !== undefined) await tx.sql`update projects set name = ${patch.name} where id = ${args.projectId}`;
    if (patch.description !== undefined)
      await tx.sql`update projects set description = ${patch.description} where id = ${args.projectId}`;
    if (patch.statusKind !== undefined)
      await tx.sql`update projects set status_kind = ${patch.statusKind} where id = ${args.projectId}`;
    if (patch.leadId !== undefined)
      await tx.sql`update projects set lead_id = ${patch.leadId} where id = ${args.projectId}`;
    if (patch.targetDate !== undefined)
      await tx.sql`update projects set target_date = ${patch.targetDate} where id = ${args.projectId}`;
  }
});

/** projects.delete — unassigns its issues, then removes the row. */
export const projectDeleteServer = serveMutation({
  mutation: projectDelete,
  handler: async (tx, args) => {
    await tx.sql`update issues set project_id = null where project_id = ${args.projectId}`;
    await tx.sql`delete from projects where id = ${args.projectId}`;
  }
});
