/**
 * The activity feed reader. Entries are server-authored; this
 * service only subscribes (lazily per issue) and resolves display strings.
 */
import { SyncService } from 'wheel/sync';
import { activityByIssue, type Activity } from '../sync/activity.sync';
import { TeamService } from './team-service';

/** Owns the per-issue activity subscriptions and display formatting. */
export class ActivityService extends SyncService {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'ActivityService';

  private readonly teamService = this.service(TeamService);
  private readonly view = this.liveQueryFor(activityByIssue, (issueId: string) => ({ issueId }));

  /** An issue's newest activity entries (server caps at 50). */
  readonly feedOf = this.computedFor(
    (issueId: string): readonly Activity[] => this.view(issueId).rows,
    'feedOf'
  );

  /**
   * Human sentence for one entry ("Grace moved this to In Review"). A plain
   * function — hashing whole rows into a computed's tuple cache buys nothing.
   */
  readonly describe = (teamId: string, entry: Activity): string => {
      const actor = this.teamService.user(entry.actorId)?.name ?? entry.actorId;
      switch (entry.kind) {
        case 'created':
          return `${actor} created this issue`;
        case 'commented':
          return `${actor} commented`;
        case 'renamed':
          return `${actor} renamed this to “${entry.detail}”`;
        case 'status': {
          const state = this.teamService.states(teamId).find((s) => s.id === entry.detail);
          return `${actor} moved this to ${state?.name ?? entry.detail}`;
        }
        case 'priority':
          return `${actor} changed the priority`;
        case 'assignee': {
          if (entry.detail === '' || entry.detail === 'null') return `${actor} unassigned this`;
          const assignee = this.teamService.user(entry.detail)?.name ?? entry.detail;
          return `${actor} assigned ${assignee}`;
        }
        case 'estimate':
          return `${actor} set the estimate`;
        case 'due-date':
          return entry.detail === '' || entry.detail === 'null'
            ? `${actor} cleared the due date`
            : `${actor} set the due date to ${entry.detail}`;
        case 'description':
          return `${actor} updated the description`;
        case 'archived':
          return `${actor} archived this issue`;
        case 'unarchived':
          return `${actor} restored this issue`;
        case 'parented':
          return entry.detail === '' ? `${actor} removed the parent` : `${actor} set the parent`;
        case 'related':
          return `${actor} added a relation`;
        case 'unrelated':
          return `${actor} removed a relation`;
        default:
          return `${actor} · ${entry.kind}`;
      }
  };
}
