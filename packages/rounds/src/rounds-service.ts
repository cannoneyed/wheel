import { SyncService, type MutationHandle } from 'wheel/sync';

import {
  checklistComplete,
  checklistsBySite,
  itemSetNote,
  itemSetStatus,
  itemsByChecklist,
  siteArchive,
  siteProgressAll,
  sitesAll,
  type Checklist,
  type Item
} from './sync/rounds.sync';

const SITE_ID = 'site_north';
const DEFAULT_CHECKLIST_ID = 'checklist_safety';

/** Owns the Rounds subscriptions, selected checklist, and product actions. */
export class RoundsService extends SyncService {
  readonly sites = this.liveQuery(sitesAll, {});
  readonly checklists = this.liveQuery(checklistsBySite, { siteId: SITE_ID });
  readonly progress = this.liveQuery(siteProgressAll, {});
  private readonly itemQueries = this.liveQueryFor(itemsByChecklist, (checklistId: string) => ({ checklistId }));
  private readonly selectedChecklistId = this.atom(DEFAULT_CHECKLIST_ID, 'selectedChecklistId');

  readonly selectedChecklist = this.computed(
    (): Checklist | undefined => this.checklists.rows.find((row) => row.id === this.selectedChecklistId.get()),
    'selectedChecklist'
  );
  readonly items = this.computed((): readonly Item[] => this.itemQueries(this.selectedChecklistId.get()).rows, 'items');
  readonly itemsStatus = this.computed(() => this.itemQueries(this.selectedChecklistId.get()).status, 'itemsStatus');
  readonly connection = this.clientRead(() => this.client.connectionStatus(), 'connection');
  readonly queued = this.clientRead(() => this.client.queuedMutations(), 'queued');
  readonly pending = this.clientRead(() => this.client.pendingMutations(), 'pending');
  readonly mutation = this.clientRead(() => this.client.mutationState(itemSetNote).last, 'itemSetNoteState');
  readonly saveState = this.computed(() => {
    if (this.connection() !== 'connected' || this.queued() > 0) return 'Saved locally';
    return this.pending() > 0 ? 'Saving' : 'Saved';
  }, 'saveState');

  readonly selectChecklist = this.action((checklistId: string) => {
    this.selectedChecklistId.set(checklistId);
  }, 'selectChecklist');

  /** Save one field note. */
  readonly setNote = (itemId: string, note: string): MutationHandle => this.mutate(itemSetNote, { itemId, note });

  /** Set one inspection outcome. */
  readonly setStatus = (itemId: string, status: Item['status']): MutationHandle =>
    this.mutate(itemSetStatus, { itemId, status });

  /** Finish every remaining item and the checklist in one local/server publication. */
  readonly completeChecklist = (): MutationHandle => {
    const checklist = this.selectedChecklist();
    if (!checklist) throw new Error('No checklist is selected.');
    return this.mutateGroup([
      ...this.items()
        .filter((item) => item.status === 'pending')
        .map((item) => ({ mutation: itemSetStatus, args: { itemId: item.id, status: 'passed' as const } })),
      { mutation: checklistComplete, args: { checklistId: checklist.id, status: 'complete' } }
    ]);
  };

  /** Archive the current site and its loaded field work. */
  readonly archiveSite = (): MutationHandle =>
    this.mutate(siteArchive, {
      siteId: SITE_ID,
      checklistIds: this.checklists.rows.map((row) => row.id),
      itemIds: this.items().map((row) => row.id)
    });
}
