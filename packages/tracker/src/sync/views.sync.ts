/**
 * Saved views: a named snapshot of one team's filter + display
 * config, stored as JSON strings. They're ordinary synced rows — every
 * client sees every saved view.
 */
import { mutation, query, t, table, type Infer, type InverseSpec } from 'wheel/sync';

/** One saved view. `filters`/`display` are ViewOptionsService snapshots (JSON). */
export const ViewRow = t.object({
  id: t.string(),
  teamId: t.string(),
  name: t.string(),
  creatorId: t.string(),
  filters: t.string(),
  display: t.string(),
  createdAt: t.number()
});

/** The views table. */
export const views = table({ name: 'views', type: ViewRow, key: (row) => row.id });

/** A team's saved views, oldest first. */
export const viewsByTeam = query({
  name: 'views.byTeam',
  params: t.object({ teamId: t.string() }),
  into: views,
  projection: {
    filter: (row, params) => row.teamId === params.teamId,
    sort: (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)
  }
});

/** Save a view (id args-borne; createdAt args-borne on the restore path). Inverse: delete it. */
export const viewCreate = mutation({
  name: 'views.create',
  args: t.object({
    viewId: t.string(),
    teamId: t.string(),
    name: t.string(),
    filters: t.string(),
    display: t.string(),
    createdAt: t.number().optional()
  }),
  optimistic: (cache, args, ctx) => {
    cache.put(views, {
      id: args.viewId,
      teamId: args.teamId,
      name: args.name,
      creatorId: ctx.actor.replace(/^user:/, ''),
      filters: args.filters,
      display: args.display,
      createdAt: args.createdAt ?? ctx.now()
    });
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: viewDelete,
    args: { viewId: args.viewId },
    description: 'save view'
  })
});

/** Delete a saved view. Inverse: re-create it byte-identical. */
export const viewDelete = mutation({
  name: 'views.delete',
  args: t.object({ viewId: t.string() }),
  optimistic: (cache, args) => {
    cache.delete(views, args.viewId);
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(views, args.viewId);
    if (!row) return null;
    return {
      mutation: viewCreate,
      args: {
        viewId: row.id,
        teamId: row.teamId,
        name: row.name,
        filters: row.filters,
        display: row.display,
        createdAt: row.createdAt
      },
      description: 'delete view'
    };
  }
});

/** Saved-view alias. */
export type SavedView = Infer<typeof ViewRow>;
