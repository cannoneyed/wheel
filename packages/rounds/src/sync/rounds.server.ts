import { rejection, sql } from 'wheel/sync';
import { serveMutation, serveQuery } from 'wheel/sync/server';

import {
  checklistComplete,
  checklistsBySite,
  itemSetNote,
  itemSetStatus,
  itemsByChecklist,
  siteArchive,
  siteProgressAll,
  sitesAll
} from './rounds.sync';

/** Rounds physical schema. */
export const ROUNDS_DDL = [
  `create table if not exists sites (
     id text primary key,
     name text not null,
     archived_at integer)`,
  `create table if not exists checklists (
     id text primary key,
     site_id text not null,
     title text not null,
     status text not null,
     position real not null)`,
  `create table if not exists items (
     id text primary key,
     checklist_id text not null,
     label text not null,
     status text not null,
     note text not null,
     revision integer not null,
     position real not null)`
] as const;

/** Active sites ordered by name. */
export const sitesAllServer = serveQuery({
  query: sitesAll,
  sql: () =>
    sql`select id, name, archived_at as "archivedAt"
        from sites where archived_at is null order by name, id`
});

/** Checklists at one site. */
export const checklistsBySiteServer = serveQuery({
  query: checklistsBySite,
  sql: (params) =>
    sql`select id, site_id as "siteId", title, status, position
        from checklists where site_id = ${params.siteId} order by position, id`
});

/** Items in one checklist. */
export const itemsByChecklistServer = serveQuery({
  query: itemsByChecklist,
  sql: (params) =>
    sql`select id, checklist_id as "checklistId", label, status, note, revision, position
        from items where checklist_id = ${params.checklistId} order by position, id`
});

/** Derived completion totals for active sites. */
export const siteProgressAllServer = serveQuery({
  query: siteProgressAll,
  sql: () =>
    sql`select c.site_id as "siteId", count(i.id) as total,
               count(i.id) filter (where i.status in ('passed', 'failed')) as complete
        from checklists c left join items i on i.checklist_id = c.id
        group by c.site_id order by c.site_id`
});

/** Persist an item status. */
export const itemSetStatusServer = serveMutation({
  mutation: itemSetStatus,
  handler: async (tx, args) => {
    await tx.sql`update items set status = ${args.status} where id = ${args.itemId}`;
  }
});

/** Persist an item note after the field-note business rule. */
export const itemSetNoteServer = serveMutation({
  mutation: itemSetNote,
  handler: async (tx, args) => {
    if (args.note.length > 80) {
      throw rejection('note_too_long', 'Inspection notes must be 80 characters or fewer.');
    }
    await tx.sql`update items set note = ${args.note}, revision = revision + 1 where id = ${args.itemId}`;
  }
});

/** Persist checklist completion or its inverse. */
export const checklistCompleteServer = serveMutation({
  mutation: checklistComplete,
  handler: async (tx, args) => {
    await tx.sql`update checklists set status = ${args.status} where id = ${args.checklistId}`;
  }
});

/** Archive a site and retire its in-progress field work. */
export const siteArchiveServer = serveMutation({
  mutation: siteArchive,
  handler: async (tx, args, context) => {
    await tx.sql`delete from items where checklist_id in
      (select id from checklists where site_id = ${args.siteId})`;
    await tx.sql`delete from checklists where site_id = ${args.siteId}`;
    await tx.sql`update sites set archived_at = ${context.now()} where id = ${args.siteId}`;
  }
});
