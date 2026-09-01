import { collection, query, t, type Infer } from 'wheel/sync';

import {
  checklistComplete,
  checklists,
  checklistsBySite,
  itemSetNote,
  itemSetStatus,
  siteArchive,
  siteProgress,
  siteProgressAll,
  sites,
  sitesAll,
  ItemRow as ItemRowA
} from '../../src/sync/rounds.sync';

/** Contract B adds one optional server audit field, so Contract A outbox previews remain valid. */
export const ItemRow = ItemRowA.extend({ auditCode: t.string().nullable().optional() });
export const items = collection({ name: 'items', type: ItemRow, key: (row) => row.id });
export const itemsByChecklist = query({
  name: 'items.byChecklist',
  params: t.object({ checklistId: t.string() }),
  into: items,
  projection: {
    filter: (row, params) => row.checklistId === params.checklistId,
    sort: (left, right) => left.position - right.position || (left.id < right.id ? -1 : 1)
  }
});

export {
  checklistComplete,
  checklists,
  checklistsBySite,
  itemSetNote,
  itemSetStatus,
  siteArchive,
  siteProgress,
  siteProgressAll,
  sites,
  sitesAll
};
export type { Checklist, Site, SiteProgress } from '../../src/sync/rounds.sync';
export type Item = Infer<typeof ItemRow>;

const roundsB = {
  sites,
  checklists,
  items,
  siteProgress,
  sitesAll,
  checklistsBySite,
  itemsByChecklist,
  siteProgressAll,
  itemSetStatus,
  itemSetNote,
  checklistComplete,
  siteArchive
};

/** Client-safe declarations for the generated Contract B build. */
export const ROUNDS_B_SYNC_MODULES = [roundsB] as const;
