/**
 * Saved views: synced named filter/display snapshots per team.
 * Applying one is a per-pane concern and lives on IssueInteractionService.
 */
import { SyncService, type MutationHandle } from 'wheel/sync';
import { viewCreate, viewDelete, viewsByTeam, type SavedView } from '../sync/views.sync';
import { ToastService } from 'wheel/kit';

/** Owns saved-view subscriptions and CRUD. */
export class ViewService extends SyncService {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'ViewService';

  private readonly toastService = this.service(ToastService);
  private readonly view = this.liveQueryFor(viewsByTeam, (teamId: string) => ({ teamId }));

  /** A team's saved views, oldest first. */
  readonly viewsFor = this.computedFor((teamId: string): readonly SavedView[] => this.view(teamId).rows, 'viewsFor');
  /** One saved view by id. */
  readonly savedView = this.computedFor(
    (teamId: string, viewId: string): SavedView | undefined =>
      this.viewsFor(teamId).find((row) => row.id === viewId),
    'savedView'
  );

  private watch(handle: MutationHandle): MutationHandle {
    void handle.settled.then((info) => {
      if (info.state === 'rejected' || info.state === 'failed' || info.state === 'orphaned') {
        this.toastService.flash(
          `view:${info.mutationId}`,
          info.rejection?.message ?? info.error?.message ?? 'Could not save the view.',
          'warn'
        );
      }
    });
    return handle;
  }

  /** Save a view (snapshots come from ViewOptionsService). Returns its id. */
  readonly create = (teamId: string, name: string, filters: string, display: string): string => {
    const viewId = this.client.newId('view');
    this.watch(this.mutate(viewCreate, { viewId, teamId, name, filters, display }));
    return viewId;
  };

  /** Delete a saved view (undoable). */
  readonly remove = (viewId: string) => this.watch(this.mutate(viewDelete, { viewId }));
}
