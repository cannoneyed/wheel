import { mutation, query, rejection, t, table } from '../../packages/wheel/src/sync';
import { serveMutation, serveQuery } from '../../packages/wheel/src/sync/server';
import { sql } from '../../packages/wheel/src/sync/sql';

export const WidgetRow = t.object({
  id: t.string(),
  title: t.string(),
  position: t.number(),
  active: t.boolean(),
  note: t.string().nullable()
});

export const widgets = table({
  name: 'widgets',
  type: WidgetRow,
  key: (row) => row.id
});

export const widgetsAll = query({
  name: 'widgets.all',
  params: t.object({}),
  into: widgets
});

export const widgetCreate = mutation({
  name: 'widgets.create',
  args: t.object({
    title: t.string(),
    position: t.number(),
    active: t.boolean(),
    note: t.string().nullable()
  })
});

export const widgetMove = mutation({
  name: 'widgets.move',
  args: t.object({ widgetId: t.string(), position: t.number() })
});

export const widgetDelete = mutation({
  name: 'widgets.delete',
  args: t.object({ widgetId: t.string() })
});

export const widgetPair = mutation({
  name: 'widgets.pair',
  args: t.object({ first: t.string(), second: t.string() })
});

export const widgetReject = mutation({
  name: 'widgets.reject',
  args: t.object({ widgetId: t.string() })
});

export const widgetFail = mutation({
  name: 'widgets.fail',
  args: t.object({ widgetId: t.string() })
});

export const WIRE_SYNC_MODULE = {
  widgets,
  widgetsAll,
  widgetCreate,
  widgetMove,
  widgetDelete,
  widgetPair,
  widgetReject,
  widgetFail
};

export const WIRE_SERVERS = {
  widgetsAllServer: serveQuery({
    query: widgetsAll,
    sql: () =>
      sql`select id, title, position, active, note from widgets order by position, id`,
    rerunOn: ['widgets']
  }),
  widgetCreateServer: serveMutation({
    mutation: widgetCreate,
    handler: async (tx, args, ctx) => {
      await tx.sql`insert into widgets (id, title, position, active, note)
        values (${ctx.newId('widget')}, ${args.title}, ${args.position}, ${args.active}, ${args.note})`;
    }
  }),
  widgetMoveServer: serveMutation({
    mutation: widgetMove,
    handler: async (tx, args) => {
      await tx.sql`update widgets set position = ${args.position} where id = ${args.widgetId}`;
    }
  }),
  widgetDeleteServer: serveMutation({
    mutation: widgetDelete,
    handler: async (tx, args) => {
      await tx.sql`delete from widgets where id = ${args.widgetId}`;
    }
  }),
  widgetPairServer: serveMutation({
    mutation: widgetPair,
    handler: async (tx, args, ctx) => {
      await tx.sql`insert into widgets (id, title, position, active, note)
        values (${ctx.newId('widget')}, ${args.first}, 1, true, null)`;
      await tx.sql`insert into widgets (id, title, position, active, note)
        values (${ctx.newId('widget')}, ${args.second}, 2, true, null)`;
    }
  }),
  widgetRejectServer: serveMutation({
    mutation: widgetReject,
    handler: async (tx, args) => {
      await tx.sql`update widgets set title = 'rolled back rejection' where id = ${args.widgetId}`;
      throw rejection('forbidden', 'fixture rejection');
    }
  }),
  widgetFailServer: serveMutation({
    mutation: widgetFail,
    handler: async (tx, args) => {
      await tx.sql`update widgets set title = 'rolled back failure' where id = ${args.widgetId}`;
      throw new Error('fixture handler failed');
    }
  })
};

export const WIRE_SCHEMA_SPEC_INPUT = {
  syncModules: [WIRE_SYNC_MODULE],
  servers: [WIRE_SERVERS]
};

export const WIRE_SCHEMA = [
  `create table widgets (
    id text primary key,
    title text not null,
    position real not null,
    active integer not null,
    note text
  )`
] as const;
