/**
 * The ports the browser suites own.
 *
 * Tests never ask portless where an app is (see AGENTS.md, "portless is for
 * humans, not for machines"): a route is claimed by NAME, names are global to
 * the machine, and the winner may be another checkout entirely. A suite that
 * resolves one can silently test code that is not the code under test.
 *
 * So every suite starts its own servers, and it starts them HERE — one block
 * of ports reserved for machine-run processes, each one the dev fallback plus
 * 100. A human's dev server on 4790 and a test's website on 4890 can run at
 * the same time, which is the normal case while working.
 *
 * A port that is somehow taken makes playwright fail to start the server, which
 * is the correct outcome. The old behavior — adopt whatever is listening —
 * turned that same collision into a green suite testing the wrong app.
 */

/** Test-only ports, each the corresponding dev fallback + 100. */
export const TEST_PORTS = {
  /** wheel.dev, serving /, /docs, /components and the demos embed. */
  website: 4890,
  /** The demos production build under `vite preview`. */
  demosPreview: 4894,
  /** The demos sync backend. */
  demosSync: 4895,
  /** The tracker sync backend, SQLite. */
  trackerSync: 4897,
  /** The tracker sync backend, Postgres via the Elixir server. */
  trackerSyncPostgres: 4899,
  /** The tracker production build under `vite preview`. */
  trackerPreview: 4898,
  /** The Tracker Worker and Durable Object backend. */
  trackerDurableObject: 4910,
  /** The Rounds SQLite sync backend. */
  roundsSync: 4902,
  /** The Rounds production build under `vite preview`. */
  roundsPreview: 4903,
  /** The external Rounds test controller. */
  roundsController: 4909,
  /** The Chalk SQLite server or Durable Object worker. */
  chalkSync: 4904,
  /** The Chalk production build under `vite preview`. */
  chalkPreview: 4905,
  /** The Spoke SQLite server or backend worker. */
  spokeSync: 4906,
  /** The Spoke production build under `vite preview`. */
  spokePreview: 4907,
  /** The second Spoke server node. */
  spokeSecondSync: 4908
} as const;

/** `http://127.0.0.1:<port>` for one reserved test port. */
export function testOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}
