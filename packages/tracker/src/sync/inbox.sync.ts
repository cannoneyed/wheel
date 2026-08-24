/**
 * Inbox sync module. Notification rows are SERVER-AUTHORED (fan-out
 * in mutation handlers — assignment, status change, comments, @mentions);
 * the client only flips read state. The inbox query is per-user by PARAMS —
 * the documented no-auth trust model: identity scopes the
 * subscription, nothing enforces it.
 *
 * Read-state mutations follow the per-target-args doctrine: ONE
 * mutation `notifications.setRead` carries explicit per-id values, so
 * mark-one, mark-all, and both undos are the same shape.
 */
import { mutation, query, t, table, type Infer, type InverseSpec } from 'wheel/sync';

/** One notification. `detail` is display context (e.g. the comment snippet). */
export const NotificationRow = t.object({
  id: t.string(),
  userId: t.string(),
  issueId: t.string(),
  kind: t.string(),
  actorId: t.string(),
  detail: t.string(),
  readAt: t.number().nullable(),
  createdAt: t.number()
});

/** The notifications table. */
export const notifications = table({
  name: 'notifications',
  type: NotificationRow,
  key: (row) => row.id
});

/** The current user's newest notifications (server caps at 100). */
export const notificationsInbox = query({
  name: 'notifications.inbox',
  params: t.object({ userId: t.string() }),
  into: notifications
});

/** Set read state on specific notifications. Inverse: the prior values back. */
export const notificationSetRead = mutation({
  name: 'notifications.setRead',
  args: t.object({
    updates: t.array(t.object({ notificationId: t.string(), readAt: t.number().nullable() }))
  }),
  optimistic: (cache, args) => {
    for (const update of args.updates) {
      if (cache.get(notifications, update.notificationId)) {
        cache.update(notifications, update.notificationId, { readAt: update.readAt });
      }
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const priors = args.updates.flatMap((update) => {
      const row = reader.get(notifications, update.notificationId);
      return row ? [{ notificationId: update.notificationId, readAt: row.readAt }] : [];
    });
    if (priors.length === 0) return null;
    return {
      mutation: notificationSetRead,
      args: { updates: priors },
      description: priors.length === 1 ? 'mark read' : `mark ${priors.length} read`
    };
  }
});

/** Notification type alias. */
export type Notification = Infer<typeof NotificationRow>;
