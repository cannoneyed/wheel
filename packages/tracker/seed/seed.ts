/**
 * Deterministic seed, shared by the dev server AND World tests — same ids
 * every run (fixed strings for core entities; issue volume comes from a
 * seeded RNG).
 */

export interface SeedDb {
  query(text: string, params?: readonly unknown[]): Promise<unknown[]>;
}

export interface SeedOptions {
  /** Rows per multi-value issue insert. Defaults to 25; use 5 for Cloudflare's 100-binding limit. */
  readonly issueBatchSize?: number;
}

/** Stable ids the app and tests may reference directly. */
export const SEED = {
  users: [
    { id: 'user_0190b62e-0000-7000-8000-00000000u001', name: 'Ada Lovelace', initials: 'AL', avatarColor: '#8b5cf6' },
    { id: 'user_0190b62e-0000-7000-8000-00000000u002', name: 'Grace Hopper', initials: 'GH', avatarColor: '#0ea5e9' },
    { id: 'user_0190b62e-0000-7000-8000-00000000u003', name: 'Alan Turing', initials: 'AT', avatarColor: '#10b981' },
    { id: 'user_0190b62e-0000-7000-8000-00000000u004', name: 'Margaret Hamilton', initials: 'MH', avatarColor: '#f59e0b' },
    { id: 'user_0190b62e-0000-7000-8000-00000000u005', name: 'Edsger Dijkstra', initials: 'ED', avatarColor: '#ef4444' },
    { id: 'user_0190b62e-0000-7000-8000-00000000u006', name: 'Barbara Liskov', initials: 'BL', avatarColor: '#ec4899' },
    { id: 'user_0190b62e-0000-7000-8000-00000000u007', name: 'Donald Knuth', initials: 'DK', avatarColor: '#14b8a6' },
    { id: 'user_0190b62e-0000-7000-8000-00000000u008', name: 'Radia Perlman', initials: 'RP', avatarColor: '#6366f1' }
  ],
  teams: [
    { id: 'team_0190b62e-0000-7000-8000-00000000t001', name: 'Engineering', key: 'ENG', color: '#6366f1', icon: '⚙', cycleLengthWeeks: 2, estimatesEnabled: true, position: 0 },
    { id: 'team_0190b62e-0000-7000-8000-00000000t002', name: 'Design', key: 'DES', color: '#ec4899', icon: '◆', cycleLengthWeeks: 2, estimatesEnabled: false, position: 1 },
    { id: 'team_0190b62e-0000-7000-8000-00000000t003', name: 'Operations', key: 'OPS', color: '#10b981', icon: '▲', cycleLengthWeeks: 1, estimatesEnabled: true, position: 2 }
  ]
} as const;

const STATE_TEMPLATE: Array<{ name: string; type: string; color: string }> = [
  { name: 'Backlog', type: 'backlog', color: '#94a3b8' },
  { name: 'Todo', type: 'unstarted', color: '#e2e8f0' },
  { name: 'In Progress', type: 'started', color: '#f59e0b' },
  { name: 'In Review', type: 'started', color: '#8b5cf6' },
  { name: 'Done', type: 'completed', color: '#10b981' },
  { name: 'Canceled', type: 'canceled', color: '#64748b' }
];

/** Stable per-team state id (referenced by tests and later seed sections). */
export function seedStateId(teamIndex: number, stateIndex: number): string {
  return `state_0190b62e-0000-7000-8000-0000000${teamIndex}s0${stateIndex}`;
}

/* ── projects + cycles ─────────────────────────────────────────────────── */

/** Seed projects (workspace-level; referenced by tests). */
export const SEED_PROJECTS = [
  { id: 'project_0190b62e-0000-7000-8000-000000000p01', name: 'Mobile launch', statusKind: 'started', leadIndex: 0, targetOffsetDays: 30, position: 0 },
  { id: 'project_0190b62e-0000-7000-8000-000000000p02', name: 'Offline mode', statusKind: 'started', leadIndex: 2, targetOffsetDays: 45, position: 1 },
  { id: 'project_0190b62e-0000-7000-8000-000000000p03', name: 'Design system v2', statusKind: 'planned', leadIndex: 5, targetOffsetDays: 90, position: 2 },
  { id: 'project_0190b62e-0000-7000-8000-000000000p04', name: 'Q3 reliability', statusKind: 'backlog', leadIndex: 4, targetOffsetDays: null, position: 3 }
] as const;

/**
 * Stable per-team cycle id. Cycle 1 has ENDED before the seed's "now" and
 * cycle 2 is ACTIVE — deliberately leaving cycle-1 leftovers for the rollover
 * job to find.
 */
export function seedCycleId(teamIndex: number, number: number): string {
  return `cycle_0190b62e-0000-7000-8000-0000000${teamIndex}c0${number}`;
}

/* ── labels + issue volume ─────────────────────────────────────────────── */

/** Workspace-level labels (teamId null) — visible to every team. */
export const SEED_WORKSPACE_LABELS = [
  { id: 'label_0190b62e-0000-7000-8000-0000000000w1', name: 'Bug', color: '#ef4444' },
  { id: 'label_0190b62e-0000-7000-8000-0000000000w2', name: 'Feature', color: '#8b5cf6' },
  { id: 'label_0190b62e-0000-7000-8000-0000000000w3', name: 'Improvement', color: '#0ea5e9' },
  { id: 'label_0190b62e-0000-7000-8000-0000000000w4', name: 'Docs', color: '#10b981' }
] as const;

const TEAM_LABEL_NAMES: readonly (readonly string[])[] = [
  ['backend', 'frontend', 'infra', 'performance'],
  ['visual', 'ux-research', 'design-system', 'accessibility'],
  ['deploy', 'monitoring', 'oncall', 'runbooks']
];
const TEAM_LABEL_COLORS = ['#f59e0b', '#14b8a6', '#6366f1', '#ec4899'];

/** Stable per-team label id. */
export function seedTeamLabelId(teamIndex: number, labelIndex: number): string {
  return `label_0190b62e-0000-7000-8000-0000000${teamIndex}l0${labelIndex}`;
}

/** Stable issue id for seed issue N (global counter across teams). */
export function seedIssueId(n: number): string {
  return `issue_0190b62e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

/** Deterministic xorshift32 in [0, 1) — same sequence every run, everywhere. */
function makeRng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x1_0000_0000;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Weighted index pick: weights need not sum to 1. */
function pickWeighted(rng: () => number, weights: readonly number[]): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (const [index, weight] of weights.entries()) {
    roll -= weight;
    if (roll <= 0) return index;
  }
  return weights.length - 1;
}

const TITLE_VERBS = ['Fix', 'Investigate', 'Improve', 'Refactor', 'Ship', 'Design', 'Document', 'Migrate', 'Optimize', 'Audit'];
const TITLE_OBJECTS = [
  'login flow', 'sync retry loop', 'board drag latency', 'issue list virtualization', 'dark theme contrast',
  'search ranking', 'notification batching', 'onboarding checklist', 'settings page layout', 'keyboard navigation',
  'error toasts', 'seed data generator', 'presence indicators', 'undo stack edge case', 'label picker',
  'context menu positioning', 'cycle rollover job', 'websocket reconnect', 'avatar rendering', 'CSV export'
];
const TITLE_SUFFIXES = ['', '', '', ' on mobile', ' for large teams', ' under offline mode', ' in Safari', ' after rebase'];
const DESCRIPTION_LINES = [
  'Reported by a customer during onboarding.',
  'Repro: open two tabs, go offline in one, edit the same issue.',
  'This blocks the next release.',
  'See the discussion in the team channel for context.',
  'Should be covered by a regression test once fixed.',
  'Low effort, high polish payoff.'
];

/** Issue volume per team (ENG, DES, OPS) — ~250 total, weighted like a real workspace. */
export const SEED_ISSUE_COUNTS = [120, 70, 60] as const;

// Fixed "now" for seed timestamps — deterministic, roughly mid-July 2026.
const SEED_NOW = 1_752_800_000_000;
const DAY = 86_400_000;

interface SeedIssue {
  id: string;
  teamId: string;
  number: number;
  title: string;
  description: string;
  stateId: string;
  priority: number;
  assigneeId: string | null;
  creatorId: string;
  estimate: number | null;
  dueDate: string | null;
  parentId: string | null;
  projectId: string | null;
  cycleId: string | null;
  sortOrder: number;
  boardOrder: number;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  labelIds: string[];
}

/** Generate the deterministic issue volume (pure — no db). Exported for tests. */
export function seedIssues(): SeedIssue[] {
  const rng = makeRng(0xa11e);
  const rows: SeedIssue[] = [];
  let counter = 0;
  // Weights per state template slot: backlog, todo, in-progress, in-review, done, canceled.
  const stateWeights = [28, 22, 14, 8, 20, 8];
  for (const [teamIndex, team] of SEED.teams.entries()) {
    const perState: number[] = [0, 0, 0, 0, 0, 0];
    const teamLabelIds = TEAM_LABEL_NAMES[teamIndex].map((_, labelIndex) => seedTeamLabelId(teamIndex, labelIndex));
    const labelPool = [...SEED_WORKSPACE_LABELS.map((label) => label.id), ...teamLabelIds];
    for (let issueIndex = 0; issueIndex < SEED_ISSUE_COUNTS[teamIndex]; issueIndex += 1) {
      counter += 1;
      const stateIndex = pickWeighted(rng, stateWeights);
      const stateType = STATE_TEMPLATE[stateIndex].type;
      const archived =
        (stateType === 'canceled' && rng() < 0.5) || (stateType === 'completed' && rng() < 0.1);
      const createdAt = SEED_NOW - Math.floor(rng() * 90 * DAY);
      const order = perState[stateIndex];
      perState[stateIndex] += 1;
      const labelCount = pickWeighted(rng, [45, 30, 20, 5]);
      const labelIds: string[] = [];
      while (labelIds.length < labelCount) {
        const labelId = pick(rng, labelPool);
        if (!labelIds.includes(labelId)) labelIds.push(labelId);
      }
      const dueDate =
        rng() < 0.2 ? new Date(SEED_NOW + Math.floor((rng() - 0.3) * 30 * DAY)).toISOString().slice(0, 10) : null;
      // ~50% join a project; ~40% are scheduled in a cycle (mostly the active
      // cycle 2, some left in the ENDED cycle 1 as rollover-job material).
      const projectId = rng() < 0.5 ? SEED_PROJECTS[Math.floor(rng() * SEED_PROJECTS.length)].id : null;
      const cycleId = archived || rng() >= 0.4 ? null : seedCycleId(teamIndex, rng() < 0.3 ? 1 : 2);
      // Sub-issues: ~15% of non-archived issues parent onto an EARLIER issue
      // of the same team (earlier-only keeps the graph acyclic by construction).
      const teamRows = rows.filter((row) => row.teamId === team.id && row.archivedAt === null);
      const parent =
        !archived && teamRows.length > 4 && rng() < 0.15 ? pick(rng, teamRows) : null;
      rows.push({
        id: seedIssueId(counter),
        teamId: team.id,
        number: issueIndex + 1,
        title: `${pick(rng, TITLE_VERBS)} ${pick(rng, TITLE_OBJECTS)}${pick(rng, TITLE_SUFFIXES)}`,
        description: rng() < 0.4 ? DESCRIPTION_LINES.slice(0, 1 + Math.floor(rng() * 3)).join('\n\n') : '',
        stateId: seedStateId(teamIndex, stateIndex),
        priority: pickWeighted(rng, [30, 8, 18, 26, 18]),
        assigneeId: rng() < 0.7 ? pick(rng, SEED.users).id : null,
        creatorId: pick(rng, SEED.users).id,
        estimate: team.estimatesEnabled && rng() < 0.5 ? pick(rng, [1, 2, 3, 5, 8]) : null,
        dueDate,
        parentId: parent?.id ?? null,
        projectId,
        cycleId,
        sortOrder: order,
        boardOrder: order,
        archivedAt: archived ? createdAt + Math.floor(rng() * 10 * DAY) : null,
        createdAt,
        updatedAt: createdAt + Math.floor(rng() * Math.max(1, SEED_NOW - createdAt)),
        labelIds
      });
    }
  }
  return rows;
}

const COMMENT_LINES = [
  'I can reproduce this on main.',
  'Taking a look now.',
  'This is related to the sync retry loop — see the linked issue.',
  'Fixed in the latest build, please verify.',
  'Punting this to next cycle unless it blocks the release.',
  'Great catch. The fix should also cover the offline path.',
  'Can we get a design pass on this before it ships?',
  'The regression test is in — closing after review.'
];
const REACTION_EMOJI = ['👍', '🎉', '👀', '❤️', '😅'];
const RELATION_KINDS = ['blocks', 'relates', 'duplicate'] as const;

interface SeedComment {
  id: string;
  issueId: string;
  authorId: string;
  body: string;
  createdAt: number;
}

interface SeedExtras {
  comments: SeedComment[];
  reactions: Array<{ commentId: string; issueId: string; userId: string; emoji: string }>;
  relations: Array<{ id: string; teamId: string; issueId: string; relatedId: string; kind: string }>;
  activity: Array<{ id: string; issueId: string; kind: string; actorId: string; detail: string; createdAt: number }>;
}

/** Deterministic comments/reactions/relations/activity over the issue volume (pure). */
export function seedExtras(issues: ReturnType<typeof seedIssues>): SeedExtras {
  const rng = makeRng(0xc0ffee);
  const extras: SeedExtras = { comments: [], reactions: [], relations: [], activity: [] };
  let commentCounter = 0;
  let relationCounter = 0;
  let activityCounter = 0;
  for (const issue of issues) {
    // Every issue gets its 'created' entry; some get a status-change trail.
    extras.activity.push({
      id: `activity_0190b62e-0000-7000-8000-${(++activityCounter).toString(16).padStart(12, '0')}`,
      issueId: issue.id,
      kind: 'created',
      actorId: issue.creatorId,
      detail: '',
      createdAt: issue.createdAt
    });
    const statusChanges = pickWeighted(rng, [50, 30, 15, 5]);
    for (let change = 0; change < statusChanges; change += 1) {
      extras.activity.push({
        id: `activity_0190b62e-0000-7000-8000-${(++activityCounter).toString(16).padStart(12, '0')}`,
        issueId: issue.id,
        kind: 'status',
        actorId: pick(rng, SEED.users).id,
        detail: issue.stateId,
        createdAt: issue.createdAt + Math.floor(rng() * Math.max(1, issue.updatedAt - issue.createdAt))
      });
    }
    // ~55% of issues carry 1-5 comments (≈400 total at seed volume).
    const commentCount = pickWeighted(rng, [45, 20, 15, 10, 6, 4]);
    for (let index = 0; index < commentCount; index += 1) {
      commentCounter += 1;
      const comment: SeedComment = {
        id: `comment_0190b62e-0000-7000-8000-${commentCounter.toString(16).padStart(12, '0')}`,
        issueId: issue.id,
        authorId: pick(rng, SEED.users).id,
        body: pick(rng, COMMENT_LINES),
        createdAt: issue.createdAt + Math.floor(rng() * Math.max(1, issue.updatedAt - issue.createdAt))
      };
      extras.comments.push(comment);
      if (rng() < 0.3) {
        extras.reactions.push({
          commentId: comment.id,
          issueId: issue.id,
          userId: pick(rng, SEED.users).id,
          emoji: pick(rng, REACTION_EMOJI)
        });
      }
      extras.activity.push({
        id: `activity_0190b62e-0000-7000-8000-${(++activityCounter).toString(16).padStart(12, '0')}`,
        issueId: issue.id,
        kind: 'commented',
        actorId: comment.authorId,
        detail: '',
        createdAt: comment.createdAt
      });
    }
  }
  // ~30 relations per workspace, always within one team, never self-referential.
  for (const [teamIndex, team] of SEED.teams.entries()) {
    const teamIssues = issues.filter((issue) => issue.teamId === team.id && issue.archivedAt === null);
    for (let index = 0; index < 10 && teamIssues.length > 2; index += 1) {
      const issue = pick(rng, teamIssues);
      const related = pick(rng, teamIssues);
      if (issue.id === related.id) continue;
      relationCounter += 1;
      extras.relations.push({
        id: `relation_0190b62e-0000-7000-8000-${relationCounter.toString(16).padStart(11, '0')}${teamIndex}`,
        teamId: team.id,
        issueId: issue.id,
        relatedId: related.id,
        kind: pick(rng, RELATION_KINDS)
      });
    }
  }
  return extras;
}

/** Apply the seed (idempotent: `on conflict do nothing`). */
export async function applySeed(db: SeedDb, options: SeedOptions = {}): Promise<void> {
  for (const user of SEED.users) {
    await db.query(
      `insert into users (id, name, initials, avatar_color) values (?, ?, ?, ?)
       on conflict (id) do nothing`,
      [user.id, user.name, user.initials, user.avatarColor]
    );
  }
  for (const team of SEED.teams) {
    await db.query(
      `insert into teams (id, name, key, color, icon, cycle_length_weeks, estimates_enabled, position)
       values (?, ?, ?, ?, ?, ?, ?, ?) on conflict (id) do nothing`,
      [team.id, team.name, team.key, team.color, team.icon, team.cycleLengthWeeks, team.estimatesEnabled, team.position]
    );
  }
  for (const [teamIndex, team] of SEED.teams.entries()) {
    for (const [stateIndex, state] of STATE_TEMPLATE.entries()) {
      await db.query(
        `insert into workflow_states (id, team_id, name, type, color, position)
         values (?, ?, ?, ?, ?, ?) on conflict (id) do nothing`,
        [seedStateId(teamIndex, stateIndex), team.id, state.name, state.type, state.color, stateIndex]
      );
    }
  }
  for (const label of SEED_WORKSPACE_LABELS) {
    await db.query(
      `insert into labels (id, team_id, name, color) values (?, null, ?, ?)
       on conflict (id) do nothing`,
      [label.id, label.name, label.color]
    );
  }
  for (const [teamIndex, team] of SEED.teams.entries()) {
    for (const [labelIndex, name] of TEAM_LABEL_NAMES[teamIndex].entries()) {
      await db.query(
        `insert into labels (id, team_id, name, color) values (?, ?, ?, ?)
         on conflict (id) do nothing`,
        [seedTeamLabelId(teamIndex, labelIndex), team.id, name, TEAM_LABEL_COLORS[labelIndex]]
      );
    }
  }
  for (const project of SEED_PROJECTS) {
    await db.query(
      `insert into projects (id, name, description, status_kind, lead_id, target_date, position)
       values (?, ?, '', ?, ?, ?, ?) on conflict (id) do nothing`,
      [
        project.id,
        project.name,
        project.statusKind,
        SEED.users[project.leadIndex].id,
        project.targetOffsetDays === null
          ? null
          : new Date(SEED_NOW + project.targetOffsetDays * DAY).toISOString().slice(0, 10),
        project.position
      ]
    );
  }
  // Two cycles per team: cycle 1 ENDED a week before SEED_NOW (rollover bait),
  // cycle 2 active around SEED_NOW.
  for (const [teamIndex, team] of SEED.teams.entries()) {
    const length = team.cycleLengthWeeks * 7 * DAY;
    const cycle2Start = SEED_NOW - 7 * DAY;
    for (const [number, startsAt] of [
      [1, cycle2Start - length],
      [2, cycle2Start]
    ] as const) {
      await db.query(
        `insert into cycles (id, team_id, number, starts_at, ends_at)
         values (?, ?, ?, ?, ?) on conflict (id) do nothing`,
        [seedCycleId(teamIndex, number), team.id, number, startsAt, startsAt + length]
      );
    }
  }
  // Issues in batches — one statement per 25 rows keeps World boot fast.
  const issues = seedIssues();
  const batchSize = options.issueBatchSize ?? 25;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('Seed issueBatchSize must be a positive integer.');
  }
  for (let start = 0; start < issues.length; start += batchSize) {
    const batch = issues.slice(start, start + batchSize);
    const params: unknown[] = [];
    const tuples = batch.map((issue) => {
      params.push(
        issue.id, issue.teamId, issue.number, issue.title, issue.description, issue.stateId,
        issue.priority, issue.assigneeId, issue.creatorId, issue.estimate, issue.dueDate,
        issue.parentId, issue.projectId, issue.cycleId, issue.sortOrder, issue.boardOrder,
        issue.archivedAt, issue.createdAt, issue.updatedAt
      );
      return `(${Array.from({ length: 19 }, () => '?').join(', ')})`;
    });
    await db.query(
      `insert into issues
         (id, team_id, number, title, description, state_id, priority, assignee_id,
          creator_id, estimate, due_date, parent_id, project_id, cycle_id,
          sort_order, board_order, archived_at, created_at, updated_at)
       values ${tuples.join(', ')} on conflict (id) do nothing`,
      params
    );
  }
  for (const issue of issues) {
    for (const labelId of issue.labelIds) {
      await db.query(
        `insert into issue_labels (issue_id, label_id, team_id) values (?, ?, ?)
         on conflict (issue_id, label_id) do nothing`,
        [issue.id, labelId, issue.teamId]
      );
    }
  }
  const extras = seedExtras(issues);
  for (const comment of extras.comments) {
    await db.query(
      `insert into comments (id, issue_id, author_id, body, edited_at, created_at)
       values (?, ?, ?, ?, null, ?) on conflict (id) do nothing`,
      [comment.id, comment.issueId, comment.authorId, comment.body, comment.createdAt]
    );
  }
  for (const reaction of extras.reactions) {
    await db.query(
      `insert into reactions (comment_id, issue_id, user_id, emoji) values (?, ?, ?, ?)
       on conflict (comment_id, user_id, emoji) do nothing`,
      [reaction.commentId, reaction.issueId, reaction.userId, reaction.emoji]
    );
  }
  for (const relation of extras.relations) {
    await db.query(
      `insert into issue_relations (id, team_id, issue_id, related_id, kind)
       values (?, ?, ?, ?, ?) on conflict (id) do nothing`,
      [relation.id, relation.teamId, relation.issueId, relation.relatedId, relation.kind]
    );
  }
  for (const entry of extras.activity) {
    await db.query(
      `insert into activity (id, issue_id, kind, actor_id, detail, created_at)
       values (?, ?, ?, ?, ?, ?) on conflict (id) do nothing`,
      [entry.id, entry.issueId, entry.kind, entry.actorId, entry.detail, entry.createdAt]
    );
  }
  // Inbox backfill: each seed comment notifies the issue's creator (skipping
  // self-comments) — enough volume that every user's inbox has content.
  const creatorByIssue = new Map(issues.map((issue) => [issue.id, issue.creatorId]));
  let notificationCounter = 0;
  for (const comment of extras.comments) {
    const creatorId = creatorByIssue.get(comment.issueId);
    if (!creatorId || creatorId === comment.authorId) continue;
    notificationCounter += 1;
    await db.query(
      `insert into notifications (id, user_id, issue_id, kind, actor_id, detail, read_at, created_at)
       values (?, ?, ?, 'comment', ?, ?, ?, ?) on conflict (id) do nothing`,
      [
        `notification_0190b62e-0000-7000-8000-${notificationCounter.toString(16).padStart(12, '0')}`,
        creatorId,
        comment.issueId,
        comment.authorId,
        comment.body.slice(0, 80),
        notificationCounter % 3 === 0 ? comment.createdAt + 3_600_000 : null,
        comment.createdAt
      ]
    );
  }
}
