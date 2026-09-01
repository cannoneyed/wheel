// #region declaration
import { query, sql, t, collection } from 'wheel/sync';

const ProjectCountsRow = t.object({
  projectId: t.string(),
  total: t.number(),
  completed: t.number()
});

export const projectCounts = collection({
  name: 'project_counts',
  type: ProjectCountsRow,
  key: (row) => row.projectId,
  keySpec: { fields: ['projectId'] }
});

export const projectCountsAll = query({
  name: 'project_counts.all',
  params: t.object({}),
  into: projectCounts,
  dependsOn: ['projects', 'issues']
});
// #endregion declaration

// #region binding
import {
  serveQuery,
  type QueryHandler,
  type QueryHandlerCtx
} from 'wheel/sync/server';

export const projectCountsServer = serveQuery({
  query: projectCountsAll,
  sql: () => sql`
    select p.id as "projectId",
           count(i.id) as total,
           count(i.id) filter (where i.completed) as completed
    from projects p
    left join issues i on i.project_id = p.id
    group by p.id
  `
});
// #endregion binding

// #region push
const SearchResult = t.object({
  id: t.string(),
  rank: t.number()
});
const searchResults = collection({
  name: 'search_results',
  type: SearchResult,
  key: (row) => row.id
});
const searchQuery = query({
  name: 'search_results.all',
  params: t.object({ q: t.string() }),
  into: searchResults,
  dependsOn: ['issues', 'comments']
});
const listeners = new Set<() => void>();

export const searchHandler: QueryHandler<
  { q: string },
  t.infer<typeof SearchResult>
> = {
  kind: 'search',
  subscribe(_params, invalidate) {
    listeners.add(invalidate);
    return () => listeners.delete(invalidate);
  },
  async run(params, context: QueryHandlerCtx) {
    return (await context.query(
      sql`select id, bm25(search_index) as rank
       from search_index
       where search_index match ${params.q}`
    )) as Array<t.infer<typeof SearchResult>>;
  }
};

export const searchServer = serveQuery({
  query: searchQuery,
  handler: searchHandler
});
// #endregion push
