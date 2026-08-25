/**
 * The inbox reader + read-state writer. One per-user subscription
 * (the actor is fixed per tab — switching reloads).
 */
import { SyncService, type MutationHandle } from 'wheel/sync';
import { notificationSetRead, notificationsInbox, type Notification } from '../sync/inbox.sync';
import { TeamService } from './team-service';
import { ToastService } from 'wheel/kit';
import { UserService } from './user-service';

/** Owns the inbox subscription and read-state mutations. */
export class InboxService extends SyncService {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'InboxService';

  private readonly userService = this.service(UserService);
  private readonly teamService = this.service(TeamService);
  private readonly toastService = this.service(ToastService);
  private readonly view = this.liveQueryFor(notificationsInbox, (userId: string) => ({ userId }));

  private mine() {
    return this.view(this.userService.actorId.get());
  }

  /** The current user's notifications, newest first (server order). */
  readonly notifications = this.computed((): readonly Notification[] => this.mine().rows, 'notifications');
  /** Unread count (the sidebar badge). */
  readonly unreadCount = this.computed(
    () => this.notifications().filter((row) => row.readAt === null).length,
    'unreadCount'
  );

  /** Human sentence for one notification ("Grace mentioned you"). */
  readonly describe = (entry: Notification): string => {
    const actor = this.teamService.user(entry.actorId)?.name ?? entry.actorId;
    switch (entry.kind) {
      case 'assigned':
        return `${actor} assigned you`;
      case 'status':
        return `${actor} changed the status`;
      case 'comment':
        return `${actor} commented`;
      case 'mention':
        return `${actor} mentioned you`;
      default:
        return `${actor} · ${entry.kind}`;
    }
  };

  private watch(handle: MutationHandle): MutationHandle {
    void handle.settled.then((info) => {
      if (info.state === 'rejected' || info.state === 'failed' || info.state === 'orphaned') {
        this.toastService.flash(
          `inbox:${info.mutationId}`,
          info.rejection?.message ?? info.error?.message ?? 'Could not update the inbox.',
          'warn'
        );
      }
    });
    return handle;
  }

  /** Mark one notification read (undoable). */
  readonly markRead = (notificationId: string) =>
    this.watch(
      this.mutate(notificationSetRead, {
        updates: [{ notificationId, readAt: this.now() }]
      })
    );

  /** Mark one notification unread (undoable). */
  readonly markUnread = (notificationId: string) =>
    this.watch(this.mutate(notificationSetRead, { updates: [{ notificationId, readAt: null }] }));

  /** Mark every unread notification read in ONE mutation (one undo step). */
  readonly markAllRead = () => {
    const now = this.now();
    const updates = this.notifications()
      .filter((row) => row.readAt === null)
      .map((row) => ({ notificationId: row.id, readAt: now }));
    if (updates.length === 0) return null;
    return this.watch(this.mutate(notificationSetRead, { updates }));
  };
}
