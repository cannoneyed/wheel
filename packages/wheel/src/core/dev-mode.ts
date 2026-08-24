/**
 * Wheel's ONE dev/prod switch, shared by every dev-only surface: view-component
 * registration (`use:viewRoot`), the `data-wheel-id` DOM stamps, and the
 * `window.__wheel` agent bridge.
 *
 * Why a runtime flag and not a build-time define: wheel is consumed from
 * source (vite alias) AND from dist by node/bun processes — one compiled
 * artifact serves both modes, so the switch must be a value, not a compile
 * branch. `wheelDevTools()` supplies an explicit runtime token to a prebuilt
 * package during Vite serve. Source consumers fall back to the bundler's
 * `import.meta.env.DEV` signal. Production falls back to false, so a bundle
 * that never calls `setWheelDevMode` pays nothing.
 *
 * The connected-component instance registry is NOT behind this flag — 009
 * decided that ships always (one Map entry per mount; debuggability is the
 * product). This flag gates the surfaces whose cost scales with EVERY dumb
 * component or that widen the app's public surface (a global on `window`).
 */

function detectDefault(): boolean {
  const explicit = (
    globalThis as typeof globalThis & { readonly __WHEEL_DEV_MODE__?: boolean }
  ).__WHEEL_DEV_MODE__;
  if (explicit !== undefined) return explicit;
  try {
    const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
    return env?.DEV === true;
  } catch {
    return false;
  }
}

let devMode = detectDefault();

/** Whether wheel's dev-only surfaces (viewRoot registration, DOM id stamps, window.__wheel) are active. */
export function isWheelDevMode(): boolean {
  return devMode;
}

/** Force dev mode on or off — overrides the bundler-derived default (tests, prod-debug opt-in). */
export function setWheelDevMode(on: boolean): void {
  devMode = on;
}
