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

export const sourceWidgets = table({
  name: 'source_widgets',
  type: WidgetRow,
  key: (row) => row.id,
  virtual: true
});

export const sourceWidgetsAll = query({
  name: 'source_widgets.all',
  params: t.object({}),
  into: sourceWidgets,
  dependsOn: []
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

export const widgetReorder = mutation({
  name: 'widgets.reorder',
  args: t.object({ widgetId: t.string(), sortOrder: t.number() })
});

export const widgetTouch = mutation({
  name: 'widgets.touch',
  args: t.object({ widgetId: t.string() })
});

export const widgetBreakQuery = mutation({
  name: 'widgets.breakQuery',
  args: t.object({})
});

export const widgetRecoverQuery = mutation({
  name: 'widgets.recoverQuery',
  args: t.object({})
});

export const systemNoop = mutation({
  name: 'system.noop',
  args: t.object({})
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
  sourceWidgets,
  sourceWidgetsAll,
  widgetCreate,
  widgetMove,
  widgetReorder,
  widgetTouch,
  widgetBreakQuery,
  widgetRecoverQuery,
  systemNoop,
  widgetDelete,
  widgetPair,
  widgetReject,
  widgetFail
};

export const WIRE_SERVERS = {
  widgetsAllServer: serveQuery({
    query: widgetsAll,
    sql: () =>
      sql`select id,
        case when (select fail from query_control where id = 1) = 1 then null else title end as title,
        position, active, note
        from widgets
        order by sort_order, id`
  }),
  sourceWidgetsAllServer: serveQuery({
    query: sourceWidgetsAll,
    handler: {
      kind: 'fixture-source',
      async run(_params, context) {
        return context.query(sql`select id, title, position, active, note from widgets order by id`);
      },
      subscribe() {
        return () => {};
      }
    }
  }),
  widgetCreateServer: serveMutation({
    mutation: widgetCreate,
    handler: async (tx, args, ctx) => {
      await tx.sql`insert into widgets (id, title, position, sort_order, active, note)
        values (${ctx.newId('widget')}, ${args.title}, ${args.position}, ${args.position}, ${args.active}, ${args.note})`;
    }
  }),
  widgetMoveServer: serveMutation({
    mutation: widgetMove,
    handler: async (tx, args) => {
      await tx.sql`update widgets set position = ${args.position} where id = ${args.widgetId}`;
    }
  }),
  widgetReorderServer: serveMutation({
    mutation: widgetReorder,
    handler: async (tx, args) => {
      await tx.sql`update widgets set sort_order = ${args.sortOrder} where id = ${args.widgetId}`;
    }
  }),
  widgetTouchServer: serveMutation({
    mutation: widgetTouch,
    handler: async (tx, args) => {
      await tx.sql`update widgets set title = title where id = ${args.widgetId}`;
    }
  }),
  widgetBreakQueryServer: serveMutation({
    mutation: widgetBreakQuery,
    handler: async (tx) => {
      await tx.sql`update query_control set fail = 1 where id = 1`;
      await tx.sql`update widgets set title = title`;
    }
  }),
  widgetRecoverQueryServer: serveMutation({
    mutation: widgetRecoverQuery,
    handler: async (tx) => {
      await tx.sql`update query_control set fail = 0 where id = 1`;
      await tx.sql`update widgets set title = title`;
    }
  }),
  systemNoopServer: serveMutation({
    mutation: systemNoop,
    handler: async () => {}
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
      await tx.sql`insert into widgets (id, title, position, sort_order, active, note)
        values (${ctx.newId('widget')}, ${args.first}, 1, 1, true, null)`;
      await tx.sql`insert into widgets (id, title, position, sort_order, active, note)
        values (${ctx.newId('widget')}, ${args.second}, 2, 2, true, null)`;
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
    sort_order real not null,
    active integer not null,
    note text
  )`,
  `create table query_control (
    id integer primary key,
    fail integer not null
  )`,
  `insert into query_control (id, fail) values (1, 0)`
] as const;
