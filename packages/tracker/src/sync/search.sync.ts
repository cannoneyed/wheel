/**
 * Search sync module. Results land in a derived collection computed by a
 * fully custom QueryHandler (search.server.ts) — the first handler in the
 * repo built without the SqlQueryHandler sugar.
 */
import { query, t, collection, type Infer } from 'wheel/sync';

/** One search hit. `id` is the matched issue's id. */
export const SearchResultRow = t.object({
  id: t.string(),
  teamId: t.string(),
  title: t.string(),
  /** Where the match came from: the issue itself or one of its comments. */
  source: t.enum(['issue', 'comment']),
  /** Text-ranked relevance (higher = better). */
  rank: t.number()
});

/** Search rows computed from physical issue and comment sources. */
export const searchResults = collection({
  name: 'search_results',
  type: SearchResultRow,
  key: (row) => row.id
});

/** Full-text search over issue titles/descriptions and comments. */
export const searchQuery = query({
  name: 'search_results.results',
  params: t.object({ q: t.string() }),
  into: searchResults,
  dependsOn: ['issues', 'comments']
});

/** Search-hit alias. */
export type SearchResult = Infer<typeof SearchResultRow>;
