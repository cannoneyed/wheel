/**
 * Activity feed sync module. Activity rows are SERVER-AUTHORED
 * ONLY: mutation handlers write them (issues.server.ts / comments.server.ts
 * via logActivity), the optimistic layer never predicts them, and the query
 * deliberately has NO projection — entries appear on confirm, which is the
 * point: the feed is the server's account of what happened.
 *
 * Retention: the query returns the newest 50 per issue (SQL limit). Row-image
 * pruning (server-side, rowImages: true) skips re-running an issue's feed
 * when the touched activity rows belong to OTHER issues.
 */
import { query, t, table, type Infer } from 'wheel/sync';

/** One activity entry. `detail` is a short display string built server-side. */
export const ActivityRow = t.object({
  id: t.string(),
  issueId: t.string(),
  kind: t.string(),
  actorId: t.string(),
  detail: t.string(),
  createdAt: t.number()
});

/** The activity table. */
export const activity = table({ name: 'activity', type: ActivityRow, key: (row) => row.id });

/** One issue's newest 50 activity entries (newest first). No projection — server-authored. */
export const activityByIssue = query({
  name: 'activity.byIssue',
  params: t.object({ issueId: t.string() }),
  into: activity
});

/** Activity type alias. */
export type Activity = Infer<typeof ActivityRow>;
