import type { SqliteDriver } from 'wheel/sync/server';

/** Stable rows used by the app and browser tests. */
export const ROUNDS_SEED = {
  site: { id: 'site_north', name: 'North plant' },
  checklist: { id: 'checklist_safety', siteId: 'site_north', title: 'Safety round' },
  emptyChecklist: { id: 'checklist_empty', siteId: 'site_north', title: 'Follow-up round' },
  items: [
    { id: 'item_exit', checklistId: 'checklist_safety', label: 'Emergency exit clear', note: 'Clear' },
    { id: 'item_alarm', checklistId: 'checklist_safety', label: 'Alarm panel online', note: 'Online' }
  ]
} as const;

/** Idempotently seed one Rounds workspace. */
export function applyRoundsSeed(driver: SqliteDriver): void {
  driver.all('insert or ignore into sites (id, name, archived_at) values (?, ?, null)', [
    ROUNDS_SEED.site.id,
    ROUNDS_SEED.site.name
  ]);
  for (const [position, checklist] of [ROUNDS_SEED.checklist, ROUNDS_SEED.emptyChecklist].entries()) {
    driver.all(
      'insert or ignore into checklists (id, site_id, title, status, position) values (?, ?, ?, ?, ?)',
      [checklist.id, checklist.siteId, checklist.title, 'open', position]
    );
  }
  for (const [position, item] of ROUNDS_SEED.items.entries()) {
    driver.all(
      'insert or ignore into items (id, checklist_id, label, status, note, revision, position) values (?, ?, ?, ?, ?, ?, ?)',
      [item.id, item.checklistId, item.label, 'pending', item.note, 0, position]
    );
  }
}
