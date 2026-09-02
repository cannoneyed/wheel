/**
 * Cycles: read-only client surface — subscriptions plus derived
 * labels. Cycles are created/rolled by the server-side job through
 * externalWrite; the client never mutates them.
 */
import { SyncService } from 'wheel/sync';
import { cycleStatsByTeam, cyclesByTeam, type Cycle, type CycleStats } from '../sync/cycles.sync';

/** Reads a team's cycles and their derived stats. */
export class CycleService extends SyncService {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'CycleService';

  private readonly cyclesView = this.liveQueryFor(cyclesByTeam, (teamId: string) => ({ teamId }));
  private readonly statsView = this.liveQueryFor(cycleStatsByTeam, (teamId: string) => ({ teamId }));
  private readonly boundaryNow = this.atom(this.now(), 'boundaryNow');
  private readonly observedTeams = new Set<string>();
  private readonly scheduledBoundary = this.field<number | null>(null);
  private readonly cancelBoundary = this.field<(() => void) | undefined>(undefined);

  /** A team's cycles, newest first. */
  readonly cyclesFor = this.computedFor((teamId: string): readonly Cycle[] => this.cyclesView(teamId).rows, 'cyclesFor');

  /** One cycle by id (searches the team's subscription). */
  readonly cycle = this.computedFor(
    (teamId: string, cycleId: string): Cycle | undefined =>
      this.cyclesFor(teamId).find((row) => row.id === cycleId),
    'cycle'
  );

  /** Stats from the derived `cycle_stats` collection. Zero until the cycle has issues. */
  readonly statsOf = this.computedFor((teamId: string, cycleId: string): CycleStats => {
    return (
      this.statsView(teamId).rows.find((row) => row.cycleId === cycleId) ?? {
        cycleId,
        scope: 0,
        started: 0,
        completed: 0
      }
    );
  }, 'statsOf');

  /**
   * The cycle covering explicit `at` epoch milliseconds. Presentation reads
   * use the system clock seam; tests pass fixed times.
   */
  readonly activeAt = (teamId: string, at: number): Cycle | undefined =>
    this.cyclesFor(teamId).find(
      (row) => row.startsAt <= at && at < row.endsAt
    );

  /**
   * The active cycle at the service's injected time. One timer wakes the atom
   * at the next observed start/end boundary; there is no periodic ticking.
   */
  readonly active = this.computedFor(
    (teamId: string): Cycle | undefined => {
      this.observedTeams.add(teamId);
      const now = this.boundaryNow.get();
      const active = this.activeAt(teamId, now);
      this.scheduleNextBoundary(now);
      return active;
    },
    'active'
  );

  /** Whether an end timestamp has passed at the same reactive boundary time. */
  readonly ended = (endsAt: number): boolean =>
    endsAt <= this.boundaryNow.get();

  private scheduleNextBoundary(now: number): void {
    let next = Infinity;
    for (const teamId of this.observedTeams) {
      for (const cycle of this.cyclesFor(teamId)) {
        if (cycle.startsAt > now) next = Math.min(next, cycle.startsAt);
        if (cycle.endsAt > now) next = Math.min(next, cycle.endsAt);
      }
    }
    const nextBoundary = Number.isFinite(next) ? next : null;
    if (nextBoundary === this.scheduledBoundary.get()) return;
    this.cancelBoundary.get()?.();
    this.cancelBoundary.set(undefined);
    this.scheduledBoundary.set(nextBoundary);
    if (nextBoundary === null) return;
    const delay = Math.min(
      2_147_483_647,
      Math.max(0, nextBoundary - now)
    );
    this.cancelBoundary.set(this.defer(delay, () => {
      this.cancelBoundary.set(undefined);
      this.scheduledBoundary.set(null);
      const boundaryNow = this.now();
      this.boundaryNow.set(boundaryNow);
      this.scheduleNextBoundary(boundaryNow);
    }));
  }

  /** Display label ("Cycle 2 · Jul 11 – Jul 25"). */
  readonly label = this.computedFor((teamId: string, cycleId: string): string => {
    const cycle = this.cycle(teamId, cycleId);
    if (!cycle) return 'Cycle';
    const format = (ms: number) => {
      const date = new Date(ms);
      return `${date.toLocaleString('en', { month: 'short' })} ${date.getDate()}`;
    };
    return `Cycle ${cycle.number} · ${format(cycle.startsAt)} – ${format(cycle.endsAt)}`;
  }, 'label');

  protected override onDestroy(): void {
    this.cancelBoundary.get()?.();
    this.cancelBoundary.set(undefined);
    this.observedTeams.clear();
  }
}
