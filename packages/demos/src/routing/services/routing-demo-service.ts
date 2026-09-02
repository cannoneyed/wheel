/**
 * The routing demo's data: two teams and a handful of issues, held in atoms.
 *
 * Deliberately local — no sync client, no server. The demo is about the URL
 * driving state, and mixing a sync engine in would obscure which part is doing
 * the work.
 */
import { Service } from 'wheel/core';

/** One team in the demo dataset. */
export interface DemoTeam {
  /** URL-safe identifier, used as the `$teamId` path param. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
}

/** One issue in the demo dataset. */
export interface DemoIssue {
  /** URL-safe identifier, used as the `$issueId` path param. */
  readonly id: string;
  /** Owning team. */
  readonly teamId: string;
  /** Display title, also what the text filter matches against. */
  readonly title: string;
  /** Workflow state, matched by the typed `status` search param. */
  readonly status: 'open' | 'done';
}

const TEAMS: readonly DemoTeam[] = [
  { id: 'core', name: 'Core' },
  { id: 'design', name: 'Design' }
];

const ISSUES: readonly DemoIssue[] = [
  { id: 'c-1', teamId: 'core', title: 'Router keeps layouts mounted', status: 'open' },
  { id: 'c-2', teamId: 'core', title: 'Search params validate with Zod', status: 'open' },
  { id: 'c-3', teamId: 'core', title: 'Back button restores filters', status: 'done' },
  { id: 'd-1', teamId: 'design', title: 'Active link styling', status: 'open' },
  { id: 'd-2', teamId: 'design', title: 'Not-found page copy', status: 'done' }
];

/** Teams and issues for the routing demo, plus the lookups its pages need. */
export class RoutingDemoService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'RoutingDemoService';

  /** Every team, in sidebar order. */
  readonly teams = this.atom<readonly DemoTeam[]>(TEAMS, 'teams');

  /** Every issue across all teams. */
  readonly issues = this.atom<readonly DemoIssue[]>(ISSUES, 'issues');

  /** One team by id, or `undefined` for a URL naming a team that does not exist. */
  readonly team = this.computedFor(
    (teamId: string) => this.teams.get().find((team) => team.id === teamId),
    'team'
  );

  /** Every issue for one team, in dataset order. */
  readonly issuesForTeam = this.computedFor(
    (teamId: string) => this.issues.get().filter((issue) => issue.teamId === teamId),
    'issuesForTeam'
  );

  /** One issue by id, or `undefined` when the URL names a missing issue. */
  readonly issue = this.computedFor(
    (issueId: string) => this.issues.get().find((issue) => issue.id === issueId),
    'issue'
  );
}
