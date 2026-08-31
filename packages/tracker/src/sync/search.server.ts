/**
 * The search backend is a hand-built QueryHandler. It does not use
 * SqlQueryHandler:
 *
 * - `run` produces ranked rows via SQLite FTS5 full-text search;
 * - the shared query declaration gives standard table invalidation;
 * - `subscribe` is a real push channel: anything can poke
 *   `searchInvalidation.notify()` and every open search re-runs + diffs —
 *   the seam a materialized view or external index (Meilisearch etc.) would use.
 *   Tests drive it directly; the engine also works with hints alone.
 *
 * SQLite FTS5 uses two materialized indexes. Two standalone FTS5 virtual
 * tables (`SEARCH_DDL`) stay in lock-step with the
 * base tables by AFTER INSERT/UPDATE/DELETE triggers:
 *   - `issue_fts(issue_id, title, description)` — one row per issue;
 *   - `comment_fts(comment_id, issue_id, body)` — one row per comment.
 * The triggers fire on ANY write to `issues`/`comments` — engine mutations AND
 * direct db writes — so the index is always fresh; whether a search re-runs is a
 * separate concern (declared dependencies or the push channel), exactly as before.
 *
 * An issue is a hit when its own text OR any of its comments match; `source` is
 * `'issue'` when the issue's own text matched, else `'comment'`; `rank` is the
 * best (max) score across the two indexes, using `-bm25()` so higher = better
 * (bm25 itself returns smaller-is-better negatives). Archived issues are
 * excluded; results cap at 25.
 *
 * FTS5 uses `bm25()` ranking. The default `unicode61` tokenizer performs case
 * folding and prefix matching, but no English stemming. The query builder adds
 * a prefix wildcard to each term and combines multiple terms with AND.
 */
import { sql } from 'wheel/sync';
import { serveQuery, type QueryHandler, type QueryHandlerCtx } from 'wheel/sync/server/cloudflare';
import { searchQuery, type SearchResult } from './search.sync';

/**
 * FTS5 index tables + sync triggers. Installed in the server's setup DDL
 * (server.ts and each World's `setup`), AFTER the `issues`/`comments` tables
 * exist and BEFORE the seed runs — so seed rows are indexed by the triggers.
 * Standalone (content-owning) FTS5 tables: they accept ordinary
 * INSERT/DELETE-by-WHERE, which is what the per-row triggers use. The id
 * columns are `unindexed` (stored, not tokenized) so the search can return them
 * and delete by them.
 */
export const SEARCH_DDL = [
  `create virtual table if not exists issue_fts using fts5(issue_id unindexed, title, description)`,
  `create virtual table if not exists comment_fts using fts5(comment_id unindexed, issue_id unindexed, body)`,
  // issues → issue_fts (one row per issue; update deletes then re-inserts it).
  `create trigger if not exists issue_fts_ai after insert on issues begin
     insert into issue_fts (issue_id, title, description)
     values (new.id, new.title, coalesce(new.description, ''));
   end`,
  `create trigger if not exists issue_fts_au after update on issues begin
     delete from issue_fts where issue_id = old.id;
     insert into issue_fts (issue_id, title, description)
     values (new.id, new.title, coalesce(new.description, ''));
   end`,
  `create trigger if not exists issue_fts_ad after delete on issues begin
     delete from issue_fts where issue_id = old.id;
   end`,
  // comments → comment_fts (keyed by comment id so a sibling comment's edit
  // never disturbs the others).
  `create trigger if not exists comment_fts_ai after insert on comments begin
     insert into comment_fts (comment_id, issue_id, body)
     values (new.id, new.issue_id, new.body);
   end`,
  `create trigger if not exists comment_fts_au after update on comments begin
     delete from comment_fts where comment_id = old.id;
     insert into comment_fts (comment_id, issue_id, body)
     values (new.id, new.issue_id, new.body);
   end`,
  `create trigger if not exists comment_fts_ad after delete on comments begin
     delete from comment_fts where comment_id = old.id;
   end`
];

/** The push channel: notify() re-runs every subscribed search. */
export const searchInvalidation = {
  listeners: new Set<() => void>(),
  /** Poke every open search subscription to re-run + diff. */
  notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
};

const MIN_QUERY = 2;

/**
 * Turn a user query into a safe FTS5 MATCH expression: extract letter/number
 * tokens (dropping any FTS5 operator characters that could break parsing),
 * quote each as a string literal, and append `*` for prefix/typeahead matching.
 * Bare space-separated terms AND together in FTS5. Returns null when the query
 * has no usable tokens.
 */
function toMatchExpr(q: string): string | null {
  const terms = q.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!terms || terms.length === 0) {
    return null;
  }
  return terms.map((term) => `"${term}"*`).join(' ');
}

/** The custom handler: FTS5 bm25 ranking over issues + their comments. */
export const searchHandler: QueryHandler<{ q: string }, SearchResult> = {
  kind: 'tracker-search',
  subscribe(_params, invalidate) {
    searchInvalidation.listeners.add(invalidate);
    return () => searchInvalidation.listeners.delete(invalidate);
  },
  async run(params, ctx: QueryHandlerCtx) {
    const q = params.q.trim();
    if (q.length < MIN_QUERY) return [];
    const match = toMatchExpr(q);
    if (match === null) return [];
    // `match` is interpolated twice and so becomes two params — one per
    // occurrence. The backend compiles the placeholders for its own database.
    return (await ctx.query(
      sql`with hits as (
         select issue_id as id, -bm25(issue_fts) as rank, 1 as is_issue
         from issue_fts where issue_fts match ${match}
         union all
         select issue_id as id, -bm25(comment_fts) as rank, 0 as is_issue
         from comment_fts where comment_fts match ${match}
       )
       select i.id,
              i.team_id as "teamId",
              i.title,
              case when max(h.is_issue) = 1 then 'issue' else 'comment' end as source,
              max(h.rank) as rank
       from hits h
       join issues i on i.id = h.id
       where i.archived_at is null
       group by i.id, i.team_id, i.title
       order by rank desc, i.id
       limit 25`
    )) as SearchResult[];
  }
};

/** search_results.results — bound to the custom handler. */
export const searchServer = serveQuery({ query: searchQuery, handler: searchHandler });
