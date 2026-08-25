/**
 * The URL-backed filter: an atom whose value lives in `?q=`.
 *
 * Nothing that reads `query` knows a URL is involved. The text box binds to an
 * atom like any other, and the address bar follows — which is what makes the
 * filtered view a shareable link, and what makes the back button restore the
 * previous filter for free.
 */
import { Service } from 'wheel/core';
import type { RouterService } from 'wheel/router';
import { z } from 'zod';

import { appRouter, type DemoRoutes } from '../../shell/routes';
import { RoutingDemoService, type DemoIssue } from './routing-demo-service';

/** Text filter plus the filtered result, for one team's issue list. */
export class IssueFilterService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'IssueFilterService';

  // Resolved at construction, well after module evaluation, so the routes ⇄
  // pages import cycle never observes an uninitialized binding.
  private readonly router = this.service(appRouter.Service) as RouterService<DemoRoutes>;
  private readonly data = this.service(RoutingDemoService);

  /** The text filter. Reads and writes `?q=` in the address bar. */
  readonly query = this.router.searchAtom('q', z.string().default(''));

  /**
   * One team's issues after both filters: the URL-backed text query and the
   * route's typed `status` search param.
   */
  readonly visibleIssues = this.computedFor((teamId: string): readonly DemoIssue[] => {
    const status = this.router.matchOf('routing.team')?.search.status ?? 'all';
    const text = this.query.get().trim().toLowerCase();
    return this.data
      .issuesForTeam(teamId)
      .filter((issue) => status === 'all' || issue.status === status)
      .filter((issue) => text === '' || issue.title.toLowerCase().includes(text));
  }, 'visibleIssues');
}
