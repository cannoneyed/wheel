/**
 * runBackendConformance — the parameterized `SyncBackend` contract suite,
 * written ONCE and run against every driver. It is deliberately test-runner
 * agnostic: the caller injects `{ describe, test, expect }` (vitest OR bun:test
 * — their APIs are compatible for the matchers used here) and a `makeHarness`
 * factory that builds a fresh backend over a fresh database. That is what closes
 * the test-vs-prod gap: `sqlite-backend.test.ts` runs this against
 * better-sqlite3 under vitest, and `sqlite-backend.bun-test.ts` runs the SAME
 * assertions against the real bun:sqlite production driver under `bun test`.
 *
 * The suite exercises the conformance rules from `sync-backend.ts`: atomic
 * mutation + log (1), monotonic seq (2), mutationId-unique → exactly-once (3),
 * deterministic id replay (4), the external-change feed as a no-op door (6),
 * plus reads, touch tracking, and — the driver-parity guard — that identical
 * stored values come back as identical JS types regardless of driver.
 */
import { RejectionError, rejection } from '../../declarations';
import { t, validateRow, type RowSchema } from '../../schema';
import { sql } from '../../sql';
import type { ServeMutationBinding, ServerMutationCtx } from '../serve';
import type { SyncBackend } from '../sync-backend';

/** One fresh backend over one fresh database, plus a raw `exec` for creating the app tables the triggers attach to, and teardown. */
export interface ConformanceHarness {
  /** The backend under test (not yet booted — the suite calls `acquireWriterLease`/`init`). */
  readonly backend: SyncBackend;
  /** Run setup DDL (create the app tables) directly on the same database the backend uses. */
  exec(sql: string): void | Promise<void>;
  /** Close the backend / database. */
  dispose(): Promise<void>;
}

/** The subset of a test runner's API the suite needs — satisfied by both vitest and bun:test. */
export interface ConformanceTestApi {
  /** Group related tests. */
  describe(name: string, fn: () => void): void;
  /** Register one test (sync or async). */
  test(name: string, fn: () => void | Promise<void>): void;
  /** Assertion entry point (matcher shape intentionally loose for cross-runner compatibility). */
  expect(actual: unknown): {
    toBe(expected: unknown): unknown;
    toEqual(expected: unknown): unknown;
    toBeNull(): unknown;
    toBeGreaterThan(expected: number): unknown;
  };
}

/**
 * Register the full `SyncBackend` conformance suite against a driver. `label`
 * names the run (e.g. `'better-sqlite3'`, `'bun:sqlite'`); `makeHarness` must
 * return a brand-new backend over a brand-new empty database each call.
 */
export function runBackendConformance(
  api: ConformanceTestApi,
  makeHarness: () => ConformanceHarness,
  label: string
): void {
  const { describe, test, expect } = api;

  /** Create the two standard app tables, boot the backend, and return the live harness. */
  async function boot(): Promise<ConformanceHarness> {
    const harness = makeHarness();
    await harness.exec('create table widgets (id text primary key, name text, flag integer, n integer, r real, s text)');
    await harness.exec('create table gadgets (id text primary key, label text)');
    await harness.backend.acquireWriterLease();
    await harness.backend.init(['widgets', 'gadgets'], {});
    return harness;
  }

  /** A minimal `ServerMutationCtx` — enough for `runMutation` (it consults only these fields). */
  function makeCtx(mutationId: string, ids: string[] = []): ServerMutationCtx {
    let next = 0;
    return {
      mutationId,
      clientId: 'client:test',
      actor: 'user:test',
      workspaceId: 'workspace:test',
      sessionId: 'session:test',
      now: () => 1_700_000_000_000,
      newId: (prefix: string) => ids[next++] ?? `${prefix}_generated_${next}`
    };
  }

  /** A minimal mutation binding — `runMutation` uses only `name` + `handler`. */
  function makeMutation(
    name: string,
    handler: ServeMutationBinding['handler']
  ): ServeMutationBinding {
    return { kind: 'serve-mutation', name, handler, mutation: undefined, declSite: 'test' } as unknown as ServeMutationBinding;
  }

  describe(`SyncBackend conformance (${label})`, () => {
    test('init on a fresh database reports lastSeq 0', async () => {
      const h = await boot();
      try {
        const { lastSeq } = await h.backend.init(['widgets', 'gadgets'], {});
        expect(lastSeq).toBe(0);
      } finally {
        await h.dispose();
      }
    });

    test('a mutation commits its write, mints seq 1, and reports the touched table', async () => {
      const h = await boot();
      try {
        const binding = makeMutation('widget.create', async (tx, args) => {
          await tx.run('insert into widgets (id, name) values (?, ?)', [args.id, args.name]);
        });
        const result = await h.backend.runMutation(binding, { id: 'w1', name: 'Alpha' }, makeCtx('m_1'));
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.seq).toBe(1);
          expect(result.touched).toEqual(['widgets']);
        }
        const rows = await h.backend.reader.query('select id, name from widgets');
        expect(rows.length).toBe(1);
        expect(rows[0]!.name).toBe('Alpha');
      } finally {
        await h.dispose();
      }
    });

    test('seq is strictly increasing across mutations and external changes', async () => {
      const h = await boot();
      try {
        const insert = makeMutation('widget.create', async (tx, args) => {
          await tx.run('insert into widgets (id, name) values (?, ?)', [args.id, args.name]);
        });
        const r1 = await h.backend.runMutation(insert, { id: 'w1', name: 'A' }, makeCtx('m_1'));
        const r2 = await h.backend.runMutation(insert, { id: 'w2', name: 'B' }, makeCtx('m_2'));
        const seq3 = await h.backend.recordExternalChange({
          mutationId: 'm_3',
          mutationName: 'external.write',
          actor: 'system:external',
          clientId: 'server:external',
          committedMs: 1_700_000_000_000,
          touched: ['widgets']
        });
        expect(r1.ok && r1.seq).toBe(1);
        expect(r2.ok && r2.seq).toBe(2);
        expect(seq3).toBe(3);
      } finally {
        await h.dispose();
      }
    });

    test('a handler exception rolls the whole transaction back and is thrown', async () => {
      const h = await boot();
      try {
        const binding = makeMutation('widget.boom', async (tx, args) => {
          await tx.run('insert into widgets (id, name) values (?, ?)', [args.id, args.name]);
          throw new Error('handler blew up');
        });
        let threw = false;
        try {
          await h.backend.runMutation(binding, { id: 'w1', name: 'A' }, makeCtx('m_1'));
        } catch {
          threw = true;
        }
        expect(threw).toBe(true);
        const rows = await h.backend.reader.query('select id from widgets');
        expect(rows.length).toBe(0);
      } finally {
        await h.dispose();
      }
    });

    test('a domain rejection is a clean rollback returning { ok: false, rejection }', async () => {
      const h = await boot();
      try {
        const binding = makeMutation('widget.reject', async (tx, args) => {
          await tx.run('insert into widgets (id, name) values (?, ?)', [args.id, args.name]);
          throw rejection('forbidden', 'not allowed');
        });
        const result = await h.backend.runMutation(binding, { id: 'w1', name: 'A' }, makeCtx('m_1'));
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.rejection.code).toBe('forbidden');
        }
        const rows = await h.backend.reader.query('select id from widgets');
        expect(rows.length).toBe(0);
      } finally {
        await h.dispose();
      }
    });

    test('a duplicate mutationId throws and does not re-apply; findCommitted returns the original seq', async () => {
      const h = await boot();
      try {
        const insert = makeMutation('widget.create', async (tx, args) => {
          await tx.run('insert into widgets (id, name) values (?, ?)', [args.id, args.name]);
        });
        const first = await h.backend.runMutation(insert, { id: 'w1', name: 'first' }, makeCtx('m_dup'));
        expect(first.ok && first.seq).toBe(1);
        let threw = false;
        try {
          await h.backend.runMutation(insert, { id: 'w2', name: 'second' }, makeCtx('m_dup'));
        } catch {
          threw = true;
        }
        expect(threw).toBe(true);
        // The second attempt's write must NOT have landed.
        const rows = await h.backend.reader.query('select id from widgets');
        expect(rows.length).toBe(1);
        const committed = await h.backend.findCommitted('m_dup');
        expect(committed?.seq ?? null).toBe(1);
        const missing = await h.backend.findCommitted('m_never');
        expect(missing).toBeNull();
      } finally {
        await h.dispose();
      }
    });

    test('the handler consumes ctx.newId in order from the pre-generated stream', async () => {
      const h = await boot();
      try {
        const binding = makeMutation('widget.pair', async (tx, _args, ctx) => {
          const a = ctx.newId('widget');
          const b = ctx.newId('widget');
          await tx.run('insert into widgets (id, name) values (?, ?)', [a, 'first']);
          await tx.run('insert into widgets (id, name) values (?, ?)', [b, 'second']);
        });
        await h.backend.runMutation(binding, {}, makeCtx('m_1', ['widget_aaa', 'widget_bbb']));
        const rows = await h.backend.reader.query('select id, name from widgets order by name');
        expect(rows.length).toBe(2);
        expect(rows[0]!.id).toBe('widget_aaa');
        expect(rows[1]!.id).toBe('widget_bbb');
      } finally {
        await h.dispose();
      }
    });

    test('touched tracks every written table, deduped in first-touch order', async () => {
      const h = await boot();
      try {
        const binding = makeMutation('mixed.write', async (tx) => {
          await tx.run('insert into gadgets (id, label) values (?, ?)', ['g1', 'G']);
          await tx.run('insert into widgets (id, name) values (?, ?)', ['w1', 'W']);
          await tx.run('insert into gadgets (id, label) values (?, ?)', ['g2', 'G2']);
        });
        const result = await h.backend.runMutation(binding, {}, makeCtx('m_1'));
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.touched).toEqual(['gadgets', 'widgets']);
        }
      } finally {
        await h.dispose();
      }
    });

    test('runQueries returns each query result in input order', async () => {
      const h = await boot();
      try {
        const insert = makeMutation('seed', async (tx) => {
          await tx.run('insert into widgets (id, name) values (?, ?)', ['w1', 'W']);
          await tx.run('insert into gadgets (id, label) values (?, ?)', ['g1', 'G']);
        });
        await h.backend.runMutation(insert, {}, makeCtx('m_1'));
        const results = await h.backend.runQueries!([
          sql`select name from widgets`,
          sql`select label from gadgets`
        ]);
        expect(results[0]![0]!.name).toBe('W');
        expect(results[1]![0]!.label).toBe('G');
      } finally {
        await h.dispose();
      }
    });

    test('onExternalChange is a no-op returning an unsubscribe; acquireWriterLease returns a release', async () => {
      const h = makeHarness();
      try {
        const unsubscribe = h.backend.onExternalChange(() => {
          throw new Error('the in-process backend must never fire the external feed');
        });
        expect(typeof unsubscribe).toBe('function');
        unsubscribe();
        const release = await h.backend.acquireWriterLease();
        expect(typeof release).toBe('function');
        await release();
        expect(h.backend.isTransientError(new Error('anything'))).toBe(false);
      } finally {
        await h.dispose();
      }
    });

    test('driver parity: stored values come back as identical JS types', async () => {
      const h = await boot();
      try {
        const binding = makeMutation('typed.write', async (tx) => {
          // flag stored as 0/1 (SQLite boolean), n a large integer, r a real, s text, and a NULL.
          await tx.run('insert into widgets (id, name, flag, n, r, s) values (?, ?, ?, ?, ?, ?)', [
            'w1',
            null,
            1,
            1_700_000_000_000,
            3.5,
            'hello'
          ]);
        });
        await h.backend.runMutation(binding, {}, makeCtx('m_1'));
        const [row] = await h.backend.reader.query('select id, name, flag, n, r, s from widgets');
        expect(typeof row!.id).toBe('string');
        expect(row!.name).toBeNull();
        expect(typeof row!.flag).toBe('number');
        expect(row!.flag).toBe(1);
        expect(typeof row!.n).toBe('number');
        expect(row!.n).toBe(1_700_000_000_000);
        expect(typeof row!.r).toBe('number');
        expect(row!.r).toBe(3.5);
        expect(typeof row!.s).toBe('string');
      } finally {
        await h.dispose();
      }
    });

    test('schema coercion repairs booleans, while the JSON boundary rejects bigint rows', async () => {
      const h = makeHarness();
      try {
        await h.exec('create table tasks (id text primary key, done integer, size integer)');
        const TaskRow = t.object({ id: t.string(), done: t.boolean(), size: t.bigint() });
        const schemas = new Map<string, RowSchema>([['tasks', TaskRow as unknown as RowSchema]]);
        await h.backend.acquireWriterLease();
        await h.backend.init(['tasks'], { tableSchemas: schemas });
        const binding = makeMutation('task.create', async (tx) => {
          // `done` bound as JS true → the driver stores 1; `size` as a JS number.
          await tx.run('insert into tasks (id, done, size) values (?, ?, ?)', ['t1', true, 42]);
        });
        await h.backend.runMutation(binding, {}, makeCtx('m_1'));
        const [row] = await h.backend.reader.query('select id, done, size from tasks');
        // Repaired at the seam: real boolean, not 1; real bigint, not number.
        expect(typeof row!.done).toBe('boolean');
        expect(row!.done).toBe(true);
        expect(typeof row!.size).toBe('bigint');
        expect(row!.size).toBe(42n);
        // Storage coercion is separate from the wire contract: bigint cannot
        // round-trip through JSON, so the engine boundary rejects it.
        let validationMessage = '';
        try {
          validateRow('conformance tasks', TaskRow as unknown as RowSchema, row);
        } catch (error) {
          validationMessage = String((error as Error)?.message ?? error);
        }
        expect(validationMessage.includes('size: bigint is not JSON')).toBe(true);
      } finally {
        await h.dispose();
      }
    });

    test('a false boolean comes back as false (not 0), and runQueries repairs types too', async () => {
      const h = makeHarness();
      try {
        await h.exec('create table flags (id text primary key, done integer)');
        const FlagRow = t.object({ id: t.string(), done: t.boolean() });
        const schemas = new Map<string, RowSchema>([['flags', FlagRow as unknown as RowSchema]]);
        await h.backend.acquireWriterLease();
        await h.backend.init(['flags'], { tableSchemas: schemas });
        const binding = makeMutation('flag.create', async (tx) => {
          await tx.run('insert into flags (id, done) values (?, ?)', ['f1', false]);
        });
        await h.backend.runMutation(binding, {}, makeCtx('m_1'));
        const [batched] = await h.backend.runQueries!([sql`select id, done from flags`]);
        expect(typeof batched![0]!.done).toBe('boolean');
        expect(batched![0]!.done).toBe(false);
      } finally {
        await h.dispose();
      }
    });

    test('RejectionError is recognized across the module boundary (single class identity)', async () => {
      const h = await boot();
      try {
        const binding = makeMutation('widget.reject', async () => {
          throw rejection('nope', 'no');
        });
        const result = await h.backend.runMutation(binding, {}, makeCtx('m_1'));
        // If two copies of RejectionError existed, the backend's instanceof check
        // would miss and this would throw instead of returning ok:false.
        expect(result.ok).toBe(false);
        expect(rejection('x', 'y') instanceof RejectionError).toBe(true);
      } finally {
        await h.dispose();
      }
    });
  });
}
