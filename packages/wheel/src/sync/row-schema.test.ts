import { describe, expect, test } from 'vitest';

import { createRowSchemaReloadGuard } from './row-schema';

const fingerprint = (digit: string) => `wheel-rows-sha256:${digit.repeat(64)}`;

describe('createRowSchemaReloadGuard', () => {
  test('allows one reload for each server fingerprint and resets after a connection', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    };
    const guard = createRowSchemaReloadGuard(storage, 'app.rowSchemaReload');

    expect(guard.shouldReload(fingerprint('a'))).toBe(true);
    expect(guard.shouldReload(fingerprint('a'))).toBe(false);
    expect(guard.shouldReload(fingerprint('b'))).toBe(true);

    guard.clear();
    expect(guard.shouldReload(fingerprint('b'))).toBe(true);
  });
});
