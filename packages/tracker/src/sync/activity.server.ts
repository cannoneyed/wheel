/**
 * Activity server binding + the logActivity helper every mutation handler
 * uses. The feed query demonstrates BOTH server-side economies:
 * - retention: SQL returns only the newest 50 per issue;
 * - row-image pruning (`rowImages: true`): a write to some OTHER issue's
 *   activity never re-runs this issue's feed query.
 */
import { sql } from 'wheel/sync';
import { serveQuery, SqlQueryHandler, type ServerTx, type ServerMutationCtx } from 'wheel/sync/server/cloudflare';
import { activityByIssue, type Activity } from './activity.sync';

/** DDL for the activity table. */
export const ACTIVITY_DDL = [
  `create table if not exists activity (
     id text primary key,
     issue_id text not null,
     kind text not null,
     actor_id text not null,
     detail text not null default '',
     created_at bigint not null)`,
  `create index if not exists activity_issue_idx on activity (issue_id, created_at desc)`
];

/** activity.byIssue — newest 50, pruned by issue id when row images allow. */
export const activityByIssueServer = serveQuery({
  query: activityByIssue,
  handler: SqlQueryHandler<{ issueId: string }, Activity>({
    sql: (params) =>
      sql`select id, issue_id as "issueId", kind, actor_id as "actorId", detail,
                 created_at as "createdAt"
          from activity where issue_id = ${params.issueId}
          order by created_at desc, id desc limit 50`,
    prune: (image, params) =>
      (image.n?.issue_id ?? image.o?.issue_id) === params.issueId
  })
});

/**
 * Append one activity row inside a mutation handler's transaction.
 *
 * Id discipline: server-authored rows can NOT use `ctx.newId` — that replays
 * the CLIENT's pre-generated id stream, and the client never minted ids for
 * rows it doesn't know exist (the engine throws `id_stream_exhausted`; found
 * the hard way). Instead the id derives from
 * (mutationId, issueId, kind) — deterministic, so an exactly-once replay of
 * the mutation regenerates the SAME id and the upsert stays idempotent.
 */
export async function logActivity(
  tx: ServerTx,
  ctx: ServerMutationCtx,
  issueId: string,
  kind: string,
  detail: string
): Promise<void> {
  const id = `activity_${ctx.mutationId.slice(2)}:${issueId.slice(-8)}:${kind}`;
  await tx.sql`insert into activity (id, issue_id, kind, actor_id, detail, created_at)
               values (${id}, ${issueId}, ${kind},
                       ${ctx.actor.replace(/^user:/, '')}, ${detail}, ${ctx.now()})
               on conflict (id) do nothing`;
}
