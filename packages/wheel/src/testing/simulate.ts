/**
 * Seeded simulation: drive a World through hundreds of random weighted ops
 * (mutations, undo/redo, network pauses) and check the engine's four
 * invariants at quiescence. Same seed, same run, forever — a failing seed is
 * a permanent regression test (see replayFixture).
 */
import type { CollectionDecl } from '../sync/declarations';
import type { SyncClient } from '../sync/client/client';
import { World, type WorldOptions } from './world';

/** Deterministic PRNG handed to every op — the only randomness in a simulation. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, max). */
  int(max: number): number;
  /** Uniform pick from a non-empty array. */
  pick<T>(items: readonly T[]): T;
}

/** One weighted action a simulation can take (weights default to 1). */
export interface SimOp {
  name: string;
  weight?: number;
  run(context: { rng: Rng; world: World; clients: SyncClient[] }): Promise<void> | void;
}

/** Simulation config: a World config plus seed, length, clients, and the op pool. */
export interface SimulateOptions extends WorldOptions {
  seed: number;
  steps: number;
  /** Number of clients driven concurrently (default 3). */
  clientCount?: number;
  /** Run once per client before stepping (subscribe to the queries under test). */
  prepare: (client: SyncClient) => Promise<void>;
  ops: SimOp[];
  /** Collections whose rows the convergence invariant compares across clients. */
  collections: CollectionDecl<any>[];
}

/** What a simulation run reports: per-op counts and the final converged rows. */
export interface SimulationReport {
  seed: number;
  steps: number;
  opCounts: Record<string, number>;
  /** Final rows per collection, from client 0 (all clients proven identical). */
  finalRows: Record<string, unknown[]>;
}

function createRng(seed: number): Rng {
  let state = seed >>> 0 || 0xdecafbad;
  const next = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  return {
    next,
    int: (max: number) => Math.floor(next() * max),
    pick: <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)]
  };
}

class InvariantViolation extends Error {
  constructor(invariant: string, detail: string, seed: number, step: number) {
    super(`Simulation invariant "${invariant}" violated at seed=${seed} step=${step}: ${detail}`);
  }
}

/** Run a seeded simulation and check all four invariants at quiescence. */
export async function simulate(options: SimulateOptions): Promise<SimulationReport> {
  const rng = createRng(options.seed);
  const world = await World.create(options);
  const clientCount = options.clientCount ?? 3;
  const clients: SyncClient[] = [];
  const paused = new Set<string>();
  try {
    for (let index = 0; index < clientCount; index += 1) {
      const client = await world.client(`sim_${index}`);
      await options.prepare(client);
      clients.push(client);
    }

    // Weighted operation pool plus built-in network chaos.
    const pool: SimOp[] = [
      ...options.ops,
      {
        name: 'network.toggle',
        weight: Math.max(1, Math.round(options.ops.length / 2)),
        run: async ({ rng: r }) => {
          const id = `sim_${r.int(clientCount)}`;
          if (paused.has(id)) {
            paused.delete(id);
            await world.network.resume(id);
          } else if (paused.size < clientCount - 1) {
            paused.add(id); // never pause everyone: progress must stay possible
            world.network.pause(id);
          }
        }
      }
    ];
    const weighted: SimOp[] = pool.flatMap((op) => Array.from({ length: op.weight ?? 1 }, () => op));

    const opCounts: Record<string, number> = {};
    for (let step = 0; step < options.steps; step += 1) {
      const op = rng.pick(weighted);
      opCounts[op.name] = (opCounts[op.name] ?? 0) + 1;
      await op.run({ rng, world, clients });
      if (rng.next() < 0.2) {
        await world.settle();
      }
    }

    // Quiescence: resume everyone, drain everything.
    for (const id of [...paused]) {
      await world.network.resume(id);
    }
    await world.settle();

    // Invariant: convergence — every client sees identical rows per collection.
    // Pool iteration order is insertion order and legitimately differs per
    // client; compare row SETS, keyed and sorted by the collection's key.
    const sortedRows = (client: SyncClient, collection: CollectionDecl): unknown[] =>
      [...client.rows(collection)].sort((a, b) => collection.key(a).localeCompare(collection.key(b)));
    for (const collection of options.collections) {
      const reference = JSON.stringify(sortedRows(clients[0], collection));
      for (const [index, client] of clients.entries()) {
        if (JSON.stringify(sortedRows(client, collection)) !== reference) {
          throw new InvariantViolation('convergence', `client sim_${index} diverges on collection ${collection.name}`, options.seed, options.steps);
        }
      }
      const seqs = new Set(clients.map((client) => client.seq()));
      seqs.add(world.server.seq());
      if (seqs.size !== 1) {
        throw new InvariantViolation('convergence', `seqs differ: ${[...seqs].join(',')}`, options.seed, options.steps);
      }
    }

    // Invariant: seqContinuity — the sync log is 1..N with no gaps.
    const logRows = await world.db.query('select seq from wheel_sync_log order by seq');
    const seqs = logRows.map((row) => Number(row.seq));
    for (const [index, seq] of seqs.entries()) {
      if (seq !== index + 1) {
        throw new InvariantViolation('seqContinuity', `expected seq ${index + 1}, found ${seq}`, options.seed, options.steps);
      }
    }
    if (world.server.seq() !== seqs.length) {
      throw new InvariantViolation('seqContinuity', `server.seq()=${world.server.seq()} but log has ${seqs.length}`, options.seed, options.steps);
    }

    // Invariant: causesComplete — every recorded write has a resolvable cause.
    const CAUSES = new Set(['bootstrap', 'sync-apply', 'optimistic', 'rollback', 'orphaned']);
    for (const client of clients) {
      for (const entry of client.recentWrites(Number.MAX_SAFE_INTEGER)) {
        if (!CAUSES.has(entry.cause.kind)) {
          throw new InvariantViolation('causesComplete', `unknown cause ${String(entry.cause.kind)}`, options.seed, options.steps);
        }
      }
    }

    // Invariant: noOrphanOptimism — every mutation reached a terminal state.
    for (const [index, client] of clients.entries()) {
      if (client.pendingMutations() !== 0) {
        throw new InvariantViolation('noOrphanOptimism', `client sim_${index} still has pending mutations`, options.seed, options.steps);
      }
    }

    return {
      seed: options.seed,
      steps: options.steps,
      opCounts,
      finalRows: Object.fromEntries(
        options.collections.map((collection) => [
          collection.name,
          [...clients[0].rows(collection)].sort((a, b) => collection.key(a).localeCompare(collection.key(b)))
        ])
      )
    };
  } finally {
    await world.close();
  }
}

/** A recorded simulation outcome: replaying the seed must reproduce these rows exactly. */
export interface ReplayFixture {
  seed: number;
  steps: number;
  finalRows: Record<string, unknown[]>;
}

/** Re-run a fixture's seed and fail loudly if any collection's final rows differ. */
export async function replayFixture(
  fixture: ReplayFixture,
  options: Omit<SimulateOptions, 'seed' | 'steps'>
): Promise<SimulationReport> {
  const report = await simulate({ ...options, seed: fixture.seed, steps: fixture.steps });
  for (const [collection, rows] of Object.entries(fixture.finalRows)) {
    const actual = JSON.stringify(report.finalRows[collection]);
    if (actual !== JSON.stringify(rows)) {
      throw new Error(`Replay diverged from fixture on collection "${collection}" (seed=${fixture.seed}): the engine's behavior changed.`);
    }
  }
  return report;
}
