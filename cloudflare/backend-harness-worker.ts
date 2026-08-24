import { DurableObject } from 'cloudflare:workers';

import { systemClock } from 'wheel/sync';
import {
  createCloudflareSyncBackend,
  runDurableObjectSql,
  type CloudflareSyncBackend,
  type DurableObjectStorageLike
} from 'wheel/sync/server/cloudflare';

function storageAdapter(storage: DurableObjectStorage): DurableObjectStorageLike {
  return {
    sql: storage.sql,
    transaction: (callback) => storage.transaction(async () => callback())
  };
}

/** Minimal Durable Object used by the backend conformance suite. */
export class BackendHarnessWorkspace extends DurableObject<Record<string, never>> {
  readonly backend: CloudflareSyncBackend;

  constructor(ctx: DurableObjectState, env: Record<string, never>) {
    super(ctx, env);
    this.backend = createCloudflareSyncBackend({
      storage: storageAdapter(ctx.storage),
      clock: systemClock
    });
  }

  exec(text: string, params?: readonly unknown[]): Record<string, unknown>[] {
    return runDurableObjectSql(this.ctx.storage.sql, text, params);
  }

  fetch(): Response {
    return new Response('Backend harness is test-only.', { status: 404 });
  }
}
