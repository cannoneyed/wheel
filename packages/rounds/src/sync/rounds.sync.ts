import {
  collection,
  mutation,
  orphan,
  query,
  t,
  type Infer,
  type InverseSpec
} from 'wheel/sync';

/** One inspection site. */
export const SiteRow = t.object({
  id: t.string(),
  name: t.string(),
  archivedAt: t.number().nullable()
});

/** One checklist at a site. */
export const ChecklistRow = t.object({
  id: t.string(),
  siteId: t.string(),
  title: t.string(),
  status: t.enum(['open', 'complete']),
  position: t.number()
});

/** One field inspection item. */
export const ItemRow = t.object({
  id: t.string(),
  checklistId: t.string(),
  label: t.string(),
  status: t.enum(['pending', 'passed', 'failed']),
  note: t.string(),
  revision: t.number(),
  position: t.number()
});

/** Derived completion totals for one site. */
export const SiteProgressRow = t.object({
  siteId: t.string(),
  total: t.number(),
  complete: t.number()
});

/** Sites collection. */
export const sites = collection({ name: 'sites', type: SiteRow, key: (row) => row.id });
/** Checklists collection. */
export const checklists = collection({ name: 'checklists', type: ChecklistRow, key: (row) => row.id });
/** Inspection items collection. */
export const items = collection({ name: 'items', type: ItemRow, key: (row) => row.id });
/** Derived site progress collection. */
export const siteProgress = collection({
  name: 'site_progress',
  type: SiteProgressRow,
  key: (row) => row.siteId,
  keySpec: { fields: ['siteId'] }
});

/** Every active site. */
export const sitesAll = query({
  name: 'sites.all',
  params: t.object({}),
  into: sites,
  projection: {
    filter: (row) => row.archivedAt === null,
    sort: (left, right) => left.name.localeCompare(right.name) || (left.id < right.id ? -1 : 1)
  }
});

/** Checklists for one site. */
export const checklistsBySite = query({
  name: 'checklists.bySite',
  params: t.object({ siteId: t.string() }),
  into: checklists,
  projection: {
    filter: (row, params) => row.siteId === params.siteId,
    sort: (left, right) => left.position - right.position || (left.id < right.id ? -1 : 1)
  }
});

/** Items for one checklist. */
export const itemsByChecklist = query({
  name: 'items.byChecklist',
  params: t.object({ checklistId: t.string() }),
  into: items,
  projection: {
    filter: (row, params) => row.checklistId === params.checklistId,
    sort: (left, right) => left.position - right.position || (left.id < right.id ? -1 : 1)
  }
});

/** Completion totals derived from checklists and items. */
export const siteProgressAll = query({
  name: 'site_progress.all',
  params: t.object({}),
  into: siteProgress,
  dependsOn: ['checklists', 'items']
});

/** Item status update. */
export const itemSetStatus = mutation({
  name: 'item.setStatus',
  args: t.object({ itemId: t.string(), status: t.enum(['pending', 'passed', 'failed']) }),
  optimistic: (cache, args) => {
    if (!cache.get(items, args.itemId)) throw orphan(`item ${args.itemId} is gone`);
    cache.update(items, args.itemId, { status: args.status });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(items, args.itemId);
    return row
      ? { mutation: itemSetStatus, args: { itemId: row.id, status: row.status }, description: 'set item status' }
      : null;
  }
});

/** Item note update. The server owns the business length limit. */
export const itemSetNote = mutation({
  name: 'item.setNote',
  args: t.object({ itemId: t.string(), note: t.string() }),
  optimistic: (cache, args) => {
    const row = cache.get(items, args.itemId);
    if (!row) throw orphan(`item ${args.itemId} is gone`);
    cache.update(items, args.itemId, { note: args.note, revision: row.revision + 1 });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(items, args.itemId);
    return row
      ? { mutation: itemSetNote, args: { itemId: row.id, note: row.note }, description: 'set item note' }
      : null;
  }
});

/** Mark one checklist complete. Item status changes join this in a client group. */
export const checklistComplete = mutation({
  name: 'checklist.complete',
  args: t.object({ checklistId: t.string(), status: t.enum(['open', 'complete']) }),
  optimistic: (cache, args) => {
    if (!cache.get(checklists, args.checklistId)) throw orphan(`checklist ${args.checklistId} is gone`);
    cache.update(checklists, args.checklistId, { status: args.status });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(checklists, args.checklistId);
    return row
      ? {
          mutation: checklistComplete,
          args: { checklistId: row.id, status: row.status },
          description: 'complete checklist'
        }
      : null;
  }
});

/** Archive a site and remove its field-work rows. */
export const siteArchive = mutation({
  name: 'site.archive',
  args: t.object({
    siteId: t.string(),
    checklistIds: t.array(t.string()),
    itemIds: t.array(t.string())
  }),
  optimistic: (cache, args, context) => {
    if (!cache.get(sites, args.siteId)) throw orphan(`site ${args.siteId} is gone`);
    cache.update(sites, args.siteId, { archivedAt: context.now() });
    for (const itemId of args.itemIds) cache.delete(items, itemId);
    for (const checklistId of args.checklistIds) cache.delete(checklists, checklistId);
  }
});

/** Site row type. */
export type Site = Infer<typeof SiteRow>;
/** Checklist row type. */
export type Checklist = Infer<typeof ChecklistRow>;
/** Inspection item row type. */
export type Item = Infer<typeof ItemRow>;
/** Site progress row type. */
export type SiteProgress = Infer<typeof SiteProgressRow>;
