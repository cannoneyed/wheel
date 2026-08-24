import type { LayoutSnapshot } from './model';

/** Synchronous persistence boundary used before the first frame render. */
export interface LayoutStorage {
  /** Read one untrusted value from the adapter. */
  read(key: string): unknown | undefined;
  /** Write one validated snapshot. */
  write(key: string, snapshot: LayoutSnapshot): void;
  /** Remove one saved snapshot. */
  remove(key: string): void;
}

function cloneSnapshot(snapshot: LayoutSnapshot): LayoutSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as LayoutSnapshot;
}

/** Deterministic in-memory storage for tests, SSR, and explicit ephemeral layouts. */
export function memoryLayoutStorage(
  initial: Readonly<Record<string, LayoutSnapshot>> = {}
): LayoutStorage {
  const values = new Map<string, LayoutSnapshot>(
    Object.entries(initial).map(([key, value]) => [key, cloneSnapshot(value)])
  );
  return {
    read: (key) => {
      const value = values.get(key);
      return value ? cloneSnapshot(value) : undefined;
    },
    write: (key, snapshot) => {
      values.set(key, cloneSnapshot(snapshot));
    },
    remove: (key) => {
      values.delete(key);
    }
  };
}

/** Local-storage adapter with lazy browser resolution and an injectable test host. */
export function localLayoutStorage(
  prefix: string,
  host?: Storage
): LayoutStorage {
  const storage = (): Storage => {
    const resolved = host ?? globalThis.localStorage;
    if (!resolved) {
      throw new Error('localStorage is unavailable in this environment');
    }
    return resolved;
  };
  const storageKey = (key: string): string => `${prefix}:${key}`;
  return {
    read: (key) => {
      const value = storage().getItem(storageKey(key));
      return value === null ? undefined : JSON.parse(value);
    },
    write: (key, snapshot) => {
      storage().setItem(storageKey(key), JSON.stringify(snapshot));
    },
    remove: (key) => {
      storage().removeItem(storageKey(key));
    }
  };
}
