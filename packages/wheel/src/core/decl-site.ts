/**
 * `captureDeclSite` — a generic stack-walk utility the kernel uses to attach a
 * best-effort source location to every declared primitive (atoms, computeds,
 * tables, queries, mutations) for registry error messages. It lives in `core`
 * because it depends on nothing but the JS call stack, and both the kernel
 * (atom/computed/action) and the sync declarations (`table`/`query`/`mutation`)
 * call it.
 */

/**
 * Best-effort source location of a declaration, for registry error messages.
 * `skip` lets contribution registries omit their own adapter frames and name
 * the application site that actually declared the contribution.
 */
export function captureDeclSite(skip?: RegExp): string {
  const stack = new Error().stack ?? '';
  const lines = stack.split('\n').slice(1);
  const frame = lines.find(
    (line) =>
      !line.includes('captureDeclSite') &&
      !/\/core\/decl-site\.(ts|js)/.test(line) &&
      !/\/sync\/declarations\.(ts|js)/.test(line) &&
      !/\/sync\/server\/serve\.(ts|js)/.test(line) &&
      !skip?.test(line)
  );
  return frame?.trim().replace(/^at\s+/, '') ?? 'unknown location';
}
