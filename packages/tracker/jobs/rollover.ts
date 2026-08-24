/**
 * Cycle auto-rollover — the OUT-OF-ENGINE writer. This job writes
 * to the database directly (no mutation, no client), then tells the engine
 * what it touched via `server.externalWrite` so every subscribed client's
 * queries re-run and converge. It is exactly the seam a webhook consumer or
 * cron worker would use.
 *
 * Determinism: `now` is an argument. The dev server passes Date.now(); tests
 * pass fixed timestamps. Idempotent: a second run at the same `now` finds
 * nothing left to roll.
 */

/** The minimal database surface the job needs. */
export interface RolloverDb {
  query(text: string, params?: readonly unknown[]): Promise<Record<string, unknown>[]>;
}

/** The minimal engine surface the job needs. */
export interface RolloverServer {
  externalWrite(input: { tables: readonly string[]; source?: string; actor?: string }): Promise<number>;
}

/** What one run did (for logs and test assertions). */
export interface RolloverReport {
  /** Cycles created to receive rolled issues. */
  readonly createdCycles: number;
  /** Issues moved forward out of ended cycles. */
  readonly rolledIssues: number;
}

const WEEK_MS = 7 * 86_400_000;

/**
 * Roll every team's ended cycles: unfinished issues (not completed/canceled,
 * not archived) move to the team's next cycle, which is created if absent.
 * One externalWrite at the end publishes everything the job touched.
 */
export async function runCycleRollover(input: {
  db: RolloverDb;
  server: RolloverServer;
  now: number;
}): Promise<RolloverReport> {
  const { db, server, now } = input;
  let createdCycles = 0;
  let rolledIssues = 0;

  const teams = (await db.query(
    `select id, cycle_length_weeks as weeks from teams`
  )) as Array<{ id: string; weeks: number }>;

  for (const team of teams) {
    // Anything unfinished sitting in an ENDED cycle?
    const [stranded] = (await db.query(
      `select count(*) as count
       from issues i
       join cycles c on c.id = i.cycle_id
       join workflow_states ws on ws.id = i.state_id
       where c.team_id = ? and c.ends_at <= ?
         and i.archived_at is null and ws.type not in ('completed', 'canceled')`,
      [team.id, now]
    )) as Array<{ count: number }>;
    if (stranded.count === 0) continue;

    // Find the team's LIVE cycle, or create exactly one that contains `now`
    // (dates stay aligned to the cadence; skipped periods are skipped, not
    // backfilled). Deterministic id — same inputs, same id — so replays and
    // concurrent runs collapse via ON CONFLICT.
    const [latest] = (await db.query(
      `select id, number, ends_at as "endsAt" from cycles
       where team_id = ? order by number desc limit 1`,
      [team.id]
    )) as Array<{ id: string; number: number; endsAt: number }>;
    let targetId: string;
    if (latest.endsAt > now) {
      targetId = latest.id;
    } else {
      const length = team.weeks * WEEK_MS;
      const periodsBehind = Math.floor((now - latest.endsAt) / length);
      const startsAt = latest.endsAt + periodsBehind * length;
      const number = latest.number + 1;
      targetId = `cycle_${team.id.slice(-12)}n${number}`;
      await db.query(
        `insert into cycles (id, team_id, number, starts_at, ends_at)
         values (?, ?, ?, ?, ?) on conflict (id) do nothing`,
        [targetId, team.id, number, startsAt, startsAt + length]
      );
      createdCycles += 1;
    }

    // One sweep: every unfinished issue in ANY ended cycle moves to the live one.
    const moved = (await db.query(
      // Each ordinal placeholder is bound exactly once (targetId appears twice
      // → ? and ?): the SQLite placeholder rewriter maps every `$n` to a
      // positional `?` and does not reuse a param across positions.
      `update issues set cycle_id = ?, updated_at = ?
       where archived_at is null
         and cycle_id in (select id from cycles where team_id = ? and ends_at <= ? and id <> ?)
         and state_id in (select id from workflow_states where type not in ('completed', 'canceled'))
       returning id`,
      [targetId, now, team.id, now, targetId]
    )) as Array<{ id: string }>;
    rolledIssues += moved.length;
  }

  if (createdCycles > 0 || rolledIssues > 0) {
    await server.externalWrite({
      tables: ['cycles', 'issues'],
      source: 'job:rollover',
      actor: 'system:rollover'
    });
  }
  return { createdCycles, rolledIssues };
}
