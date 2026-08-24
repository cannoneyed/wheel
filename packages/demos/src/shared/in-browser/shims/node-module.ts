/**
 * Browser shim for `node:module`, aliased in vite.config.ts. wheel's
 * sqlite-driver calls `createRequire` at module load to reach `bun:sqlite` /
 * `better-sqlite3` lazily; in the browser bundle those drivers are never
 * invoked (the worker injects the WASM driver), so the shim only needs to
 * satisfy the module-load call and fail loudly if a native driver is
 * actually requested.
 */
export function createRequire(_url: string | URL): (id: string) => never {
  return (id: string) => {
    throw new Error(`node:module createRequire is unavailable in the browser (requested "${id}")`);
  };
}
