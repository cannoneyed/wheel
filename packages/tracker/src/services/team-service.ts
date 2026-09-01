/**
 * Teams, users, and workflow states — the workspace foundation queries.
 * Every synced read the sidebar and views need.
 */
import { SyncService, type QueryStatus, type Infer } from 'wheel/sync';
import {
  TeamRow,
  UserRow,
  WorkflowStateRow,
  statesByTeam,
  teamUpdate,
  teamsAll,
  usersAll
} from '../sync/teams.sync';

export type Team = Infer<typeof TeamRow>;
export type User = Infer<typeof UserRow>;
export type WorkflowState = Infer<typeof WorkflowStateRow>;

/** Owns the workspace-foundation subscriptions and team mutations. */
export class TeamService extends SyncService {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'TeamService';

  private readonly teamsQuery = this.liveQuery(teamsAll, {});
  private readonly usersQuery = this.liveQuery(usersAll, {});

  /** All teams in sidebar order. */
  readonly teams = this.computed((): readonly Team[] => this.teamsQuery.rows as readonly Team[]);
  /** Foundation load state (drives the shell's boot skeleton). */
  readonly status = this.computed((): QueryStatus => this.teamsQuery.status);
  /** All workspace users, alphabetized. */
  readonly users = this.computed((): readonly User[] => this.usersQuery.rows as readonly User[]);

  /** One team by id ('' key tolerated for route params). */
  readonly team = this.computedFor((teamId: string): Team | undefined => {
    return this.teams().find((team) => team.id === teamId);
  });

  /** One user by id. */
  readonly user = this.computedFor((userId: string): User | undefined => {
    return this.users().find((user) => user.id === userId);
  });

  private readonly statesView = this.liveQueryFor(statesByTeam, (teamId: string) => ({ teamId }));

  /** A team's workflow states in position order (per-team lazy subscription). */
  readonly states = this.computedFor(
    (teamId: string): readonly WorkflowState[] => this.statesView(teamId).rows
  );

  /** Patch team settings (undoable). */
  readonly update = (teamId: string, patch: Partial<Pick<Team, 'name' | 'color' | 'cycleLengthWeeks' | 'estimatesEnabled'>>) =>
    this.mutate(teamUpdate, { teamId, patch });
}
