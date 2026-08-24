// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import type { SqliteDriver } from './backends/sqlite-driver';
import { SyncServerError } from './errors';
import { createSyncServer } from './node-engine';
import type { SyncBackend } from './sync-backend';

function fakeBackend(options: { initError?: Error } = {}) {
  const release = vi.fn(async () => {});
  const close = vi.fn(async () => {});
  const backend: SyncBackend = {
    acquireWriterLease: vi.fn(async () => release),
    init: vi.fn(async () => {
      if (options.initError) throw options.initError;
      return { lastSeq: 0 };
    }),
    runMutation: vi.fn(async () => ({ ok: true as const, seq: 1, touched: [] })),
    findCommitted: vi.fn(async () => null),
    recordExternalChange: vi.fn(async () => 1),
    reader: { query: vi.fn(async () => []) },
    onExternalChange: vi.fn(() => () => {}),
    isTransientError: vi.fn(() => false),
    close
  };
  return { backend, release, close };
}

function fakeSqliteDriver(): SqliteDriver & { close: ReturnType<typeof vi.fn> } {
  return {
    exec: vi.fn(),
    all: vi.fn((text: string) => (text.includes('coalesce(max(seq)') ? [{ seq: 0 }] : [])),
    close: vi.fn()
  };
}

describe('SyncServer owned-resource lifecycle', () => {
  test('requires exactly one backend source', async () => {
    await expect(createSyncServer({ syncModules: [], servers: [] })).rejects.toMatchObject({
      code: 'invalid_backend_config'
    });

    const { backend } = fakeBackend();
    await expect(
      createSyncServer({
        backend,
        sqlite: {},
        syncModules: [],
        servers: []
      })
    ).rejects.toMatchObject({ code: 'invalid_backend_config' });
  });

  test('close is idempotent and closes its backend exactly once', async () => {
    const harness = fakeBackend();
    const server = await createSyncServer({
      backend: harness.backend,
      syncModules: [],
      servers: []
    });

    await Promise.all([server.close(), server.close()]);

    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(harness.close).toHaveBeenCalledTimes(1);
  });

  test('boot failure still releases the lease and closes the backend', async () => {
    const initError = new Error('install failed');
    const harness = fakeBackend({ initError });

    await expect(
      createSyncServer({
        backend: harness.backend,
        syncModules: [],
        servers: []
      })
    ).rejects.toBe(initError);

    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(harness.close).toHaveBeenCalledTimes(1);
  });

  test('SQLite rejects a second writer for the same database identity', async () => {
    const firstDriver = fakeSqliteDriver();
    const secondDriver = fakeSqliteDriver();
    const thirdDriver = fakeSqliteDriver();
    const databaseId = 'engine-lifecycle-test';
    const first = await createSyncServer({
      sqlite: { driver: firstDriver, databaseId },
      syncModules: [],
      servers: []
    });

    await expect(
      createSyncServer({
        sqlite: { driver: secondDriver, databaseId },
        syncModules: [],
        servers: []
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<SyncServerError>>({ code: 'single_writer_violation' })
    );
    expect(secondDriver.close).toHaveBeenCalledTimes(1);

    await first.close();
    const third = await createSyncServer({
      sqlite: { driver: thirdDriver, databaseId },
      syncModules: [],
      servers: []
    });
    await third.close();
  });
});
