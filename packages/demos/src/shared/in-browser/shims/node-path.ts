/**
 * Browser shim for `node:path`, aliased in vite.config.ts. wheel's
 * sqlite-backend resolves database FILE paths with it; the in-browser worker
 * only ever opens `:memory:` databases, so a join-shaped resolve keeps the
 * import satisfied without pulling a node polyfill into the bundle.
 */
export function resolve(...parts: string[]): string {
  return parts.join('/');
}
