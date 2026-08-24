import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, test } from 'vitest';

import type { SyncBackend } from '../packages/wheel/src/sync/server/sync-backend';
import { runBackendConformance } from '../packages/wheel/src/sync/server/backends/conformance';
import type { BackendHarnessWorkspace } from './backend-harness-worker';

function makeHarness() {
  const namespace = env.BACKEND_HARNESS as unknown as DurableObjectNamespace<BackendHarnessWorkspace>;
  const stub = namespace.get(namespace.newUniqueId());
  const inside = <T>(
    callback: (instance: BackendHarnessWorkspace) => T | Promise<T>
  ): Promise<T> => runInDurableObject(stub, callback);

  const backend: SyncBackend = {
    reader: {
      query: (source, params) =>
        inside((instance) =>
          typeof source === 'string'
            ? instance.backend.reader.query(source, params)
            : instance.backend.reader.query(source)
        )
    },
    async acquireWriterLease() {
      await inside(async (instance) => {
        const release = await instance.backend.acquireWriterLease();
        await release();
      });
      return async () => {};
    },
    init: (tables, options) => inside((instance) => instance.backend.init(tables, options)),
    runMutation: (binding, args, ctx) =>
      inside((instance) => instance.backend.runMutation(binding, args, ctx)),
    findCommitted: (mutationId) =>
      inside((instance) => instance.backend.findCommitted(mutationId)),
    recordExternalChange: (input) =>
      inside((instance) => instance.backend.recordExternalChange(input)),
    runQueries: (queries) => inside((instance) => instance.backend.runQueries(queries)),
    onExternalChange: () => () => {},
    isTransientError: () => false,
    close: () => inside((instance) => instance.backend.close())
  };

  return {
    backend,
    exec: async (sql: string) => {
      await inside((instance) => instance.exec(sql));
    },
    dispose: () => inside((instance) => instance.backend.close())
  };
}

runBackendConformance({ describe, test, expect }, makeHarness, 'Cloudflare Durable Object SQLite');
