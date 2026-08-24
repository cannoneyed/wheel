/**
 * Cycles sync module. Cycles are ENTIRELY server-managed: the seed
 * creates the first ones and the rollover job (jobs/rollover.ts, via
 * `server.externalWrite`) creates successors and moves unfinished issues —
 * there are no client mutations here at all. Clients only subscribe:
 * `cycles.byTeam` for the rows, `cycleStats.byTeam` for the VIRTUAL per-cycle
 * progress (scope/started/completed), recomputed through its watch list
 * whenever issues or cycles change.
 */
import { query, t, table, type Infer } from 'wheel/sync';

/** One cycle: a numbered, dated iteration of a team. */
export const CycleRow = t.object({
  id: t.string(),
  teamId: t.string(),
  number: t.number(),
  /** Epoch ms, inclusive start. */
  startsAt: t.number(),
  /** Epoch ms, exclusive end. */
  endsAt: t.number()
});

/** The cycles table. */
export const cycles = table({ name: 'cycles', type: CycleRow, key: (row) => row.id });

/** Derived per-cycle progress. VIRTUAL — computed by the query, never written. */
export const CycleStatsRow = t.object({
  cycleId: t.string(),
  /** Active issues scheduled in the cycle. */
  scope: t.number(),
  /** Of those, in a `started`-type state. */
  started: t.number(),
  /** Of those, in a `completed`/`canceled`-type state. */
  completed: t.number()
});

/** The cycle_stats virtual table. */
export const cycleStats = table({
  name: 'cycle_stats',
  type: CycleStatsRow,
  key: (row) => row.cycleId,
  virtual: true
});

/** A team's cycles, newest first. */
export const cyclesByTeam = query({
  name: 'cycles.byTeam',
  params: t.object({ teamId: t.string() }),
  into: cycles,
  projection: {
    filter: (row, params) => row.teamId === params.teamId,
    sort: (a, b) => b.number - a.number || (a.id < b.id ? -1 : 1)
  }
});

/** A team's cycle stats. No projection — derived rows are server-computed only. */
export const cycleStatsByTeam = query({
  name: 'cycle_stats.byTeam',
  params: t.object({ teamId: t.string() }),
  into: cycleStats
});

/** Cycle type alias. */
export type Cycle = Infer<typeof CycleRow>;
/** Cycle-stats alias. */
export type CycleStats = Infer<typeof CycleStatsRow>;
