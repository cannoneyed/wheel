/**
 * Look up a live portless route — the repo's ONE answer to "what port is
 * <app> on?".
 *
 * WHY: hard-coded ports collide across checkouts. A sibling repo's dev
 * server on 4794 once made playwright's `reuseExistingServer` adopt it, and
 * the standalone behavior suite silently tested the wrong app. portless
 * already solves this: it assigns each named app a FREE port and proxies
 * `https://<name>.localhost` to it. This helper is how the repo's configs
 * ask portless where something is, instead of assuming a number.
 *
 * Deliberately runner-agnostic: it reads portless's own state file, so it
 * works the same whether the process was started by Solo, a bare terminal
 * (`portless wheel-demos bun run demos`) or any other supervisor. There
 * is NO check for a particular terminal or supervisor.
 *
 * Every caller keeps its literal-port fallback, so a machine with no
 * portless running behaves exactly as before.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** A live portless route: the named URL and the real port behind it. */
export interface PortlessRoute {
  /** `https://<name>.localhost` — the stable, cookie-isolated address. */
  readonly url: string;
  /** The assigned port on 127.0.0.1 — use this for internal proxying (no TLS hop). */
  readonly port: number;
}

interface RouteEntry {
  readonly hostname: string;
  readonly port: number;
  readonly pid: number;
}

const ROUTES_FILE = join(homedir(), '.portless', 'routes.json');

/** A registered route whose process died leaves a stale entry behind; signal 0 just tests existence. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * The live route for `name`, or null when portless isn't running, the app
 * isn't registered, or its process is gone.
 *
 * Git worktrees get a branch subdomain (`feature-x.wheel-demos.localhost`),
 * so an exact miss falls back to any live route ending in `.<name>.localhost`
 * — a worktree's servers are found without configuring anything per branch.
 */
export function portlessRoute(name: string): PortlessRoute | null {
  let entries: RouteEntry[];
  try {
    entries = JSON.parse(readFileSync(ROUTES_FILE, 'utf8')) as RouteEntry[];
  } catch {
    return null; // no portless on this machine — callers fall back to literals
  }
  if (!Array.isArray(entries)) return null;
  const live = entries.filter((entry) => entry?.hostname && processAlive(entry.pid));
  const exact = live.find((entry) => entry.hostname === `${name}.localhost`);
  const match = exact ?? live.find((entry) => entry.hostname.endsWith(`.${name}.localhost`));
  if (!match) return null;
  return { url: `https://${match.hostname}`, port: match.port };
}

/** The portless URL for `name`, or `fallback` when no live route exists. */
export function portlessUrlOr(name: string, fallback: string): string {
  return portlessRoute(name)?.url ?? fallback;
}

/** A direct `http://127.0.0.1:<port>` origin for `name` (internal proxy targets), or `fallback`. */
export function portlessOriginOr(name: string, fallback: string): string {
  const route = portlessRoute(name);
  return route ? `http://127.0.0.1:${route.port}` : fallback;
}
