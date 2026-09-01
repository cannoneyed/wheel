/**
 * Workspace foundation: users, teams, and per-team workflow states.
 * The shared client/server contract (optimistic handlers mirror
 * teams.server.ts exactly).
 */
import { patchMutation, query, t, collection } from 'wheel/sync';

/** A workspace member profile. Production actor identity comes from server authentication. */
export const UserRow = t.object({
  id: t.string(),
  name: t.string(),
  initials: t.string(),
  avatarColor: t.string()
});
export const users = collection({ name: 'users', type: UserRow, key: (row) => row.id });

/** A team: key is the issue-identifier prefix (ENG-42), unique server-side. */
export const TeamRow = t.object({
  id: t.string(),
  name: t.string(),
  key: t.string(),
  color: t.string(),
  icon: t.string(),
  cycleLengthWeeks: t.number(),
  estimatesEnabled: t.boolean(),
  position: t.number()
});
export const teams = collection({ name: 'teams', type: TeamRow, key: (row) => row.id });

/** Workflow state category — drives grouping order and board semantics. */
export const StateType = t.enum(['backlog', 'unstarted', 'started', 'completed', 'canceled']);

/** A per-team workflow state. */
export const WorkflowStateRow = t.object({
  id: t.string(),
  teamId: t.string(),
  name: t.string(),
  type: StateType,
  color: t.string(),
  position: t.number()
});
export const workflowStates = collection({
  name: 'workflow_states',
  type: WorkflowStateRow,
  key: (row) => row.id
});

export const usersAll = query({
  name: 'users.all',
  params: t.object({}),
  into: users,
  projection: { filter: () => true, sort: (a, b) => a.name.localeCompare(b.name) }
});

export const teamsAll = query({
  name: 'teams.all',
  params: t.object({}),
  into: teams,
  projection: { filter: () => true, sort: (a, b) => a.position - b.position }
});

export const statesByTeam = query({
  name: 'workflow_states.byTeam',
  params: t.object({ teamId: t.string() }),
  into: workflowStates,
  projection: {
    filter: (row, params) => row.teamId === params.teamId,
    sort: (a, b) => a.position - b.position
  }
});

/** Team settings edits: name/color/cycle length/estimates toggle. */
export const teamUpdate = patchMutation({
  name: 'teams.update',
  args: t.object({
    teamId: t.string(),
    patch: t.object({
      name: t.string().optional(),
      color: t.string().optional(),
      cycleLengthWeeks: t.number().optional(),
      estimatesEnabled: t.boolean().optional()
    })
  }),
  collection: teams,
  id: (args) => args.teamId,
  description: 'team settings'
});
