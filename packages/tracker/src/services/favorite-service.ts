/**
 * Favorites: the current user's starred entities, with display
 * resolution composed here so the sidebar component stays at two services.
 */
import { SyncService, positionBetween, type MutationHandle } from 'wheel/sync';
import {
  favoriteAdd,
  favoriteRemove,
  favoriteReorder,
  favoritesMine,
  type Favorite
} from '../sync/favorites.sync';
import { IssueService } from './issue-service';
import { ProjectService } from './project-service';
import { TeamService } from './team-service';
import { ToastService } from 'wheel/kit';
import { UserService } from './user-service';

/** A favorite plus its resolved display data. */
export interface FavoriteVm {
  readonly favorite: Favorite;
  readonly title: string;
  readonly icon: string;
}

/** Owns the favorites subscription, star/unstar, and reorder. */
export class FavoriteService extends SyncService {
  private readonly userService = this.service(UserService);
  private readonly issueService = this.service(IssueService);
  private readonly projectService = this.service(ProjectService);
  private readonly teamService = this.service(TeamService);
  private readonly toastService = this.service(ToastService);
  private readonly view = this.liveQueryFor(favoritesMine, (userId: string) => ({ userId }));

  private mine() {
    return this.view(this.userService.actorId.get());
  }

  /** The user's favorites in manual order. */
  readonly favorites = this.computed((): readonly Favorite[] => this.mine().rows, 'favorites');

  /** The favorite row for a target, if starred. */
  readonly favoriteOf = this.computedFor(
    (kind: Favorite['kind'], targetId: string): Favorite | undefined =>
      this.favorites().find((row) => row.kind === kind && row.targetId === targetId),
    'favoriteOf'
  );

  /** Display-resolved favorites (the sidebar's read). */
  readonly favoriteVms = this.computed(
    (): readonly FavoriteVm[] =>
      this.favorites().map((favorite) => {
        switch (favorite.kind) {
          case 'issue': {
            const issue = this.issueService.locate(favorite.targetId);
            return { favorite, title: issue?.title ?? 'Issue…', icon: '◆' };
          }
          case 'project':
            return { favorite, title: this.projectService.project(favorite.targetId)?.name ?? 'Project…', icon: '▣' };
          case 'team':
            return { favorite, title: this.teamService.team(favorite.targetId)?.name ?? 'Team…', icon: '⚑' };
          case 'view':
            return { favorite, title: 'Saved view', icon: '⧉' };
        }
      }),
    'favoriteVms'
  );

  private watch(handle: MutationHandle): MutationHandle {
    void handle.settled.then((info) => {
      if (info.state === 'rejected' || info.state === 'failed' || info.state === 'orphaned') {
        this.toastService.flash(
          `favorite:${info.mutationId}`,
          info.rejection?.message ?? info.error?.message ?? 'Could not update favorites.',
          'warn'
        );
      }
    });
    return handle;
  }

  /** Star or unstar a target (undoable either way). */
  readonly toggle = (kind: Favorite['kind'], targetId: string) => {
    const existing = this.favoriteOf(kind, targetId);
    if (existing) {
      return this.watch(this.mutate(favoriteRemove, { favoriteId: existing.id }));
    }
    const last = this.favorites().at(-1);
    return this.watch(
      this.mutate(favoriteAdd, {
        favoriteId: this.client.newId('favorite'),
        kind,
        targetId,
        position: positionBetween(last?.position, undefined)
      })
    );
  };

  /** Move a favorite between two neighbors (one fractional write). */
  readonly reorder = (favoriteId: string, beforePosition: number | undefined, afterPosition: number | undefined) =>
    this.watch(
      this.mutate(favoriteReorder, { favoriteId, position: positionBetween(beforePosition, afterPosition) })
    );
}
