/**
 * Playwright global setup: prove the server under test is THIS checkout.
 *
 * The suites start their own servers now, so normally this passes trivially.
 * It exists for the one door left open — `*_BROWSER_BASE_URL`, a human
 * pointing the suite somewhere on purpose — and for the stale case: a server
 * that is on the right port but running code from another worktree.
 *
 * Production already works this way. The deployed worker stamps every response
 * with `x-wheel-commit`, and `deploy-branch.ts` refuses to smoke-check a URL
 * serving a different commit. This is the same idea for a dev server, using
 * the identity `wheelDevTools()` serves at `/__wheel/identity`.
 *
 * Two strengths, because the two cases differ:
 *
 * - a server the SUITE started is ours by construction, so silence is fine —
 *   a static host has no dev-tools middleware to answer with;
 * - a server named by a `*_BROWSER_BASE_URL` override must PROVE itself. That
 *   is the door a mistake comes through, and silence there means the server is
 *   either not a wheel dev server or is running code old enough to predate
 *   this check. Both are reasons to stop.
 */
import { fileURLToPath } from 'node:url';
import type { FullConfig } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

/** How long to wait for the server playwright is starting alongside us. */
const READY_TIMEOUT_MS = 60_000;

/** Gap between attempts while the server boots. */
const RETRY_MS = 500;

interface Identity {
  readonly ok?: boolean;
  readonly root?: string;
  readonly cwd?: string;
}

/**
 * Ask one base URL who it is, or null when it cannot say.
 *
 * It retries while the connection is refused, because playwright may still be
 * starting the server this runs alongside. A server that answers but has no
 * dev-tools middleware returns null immediately — there is nothing to wait for.
 */
async function identityOf(baseURL: string): Promise<Identity | null> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/__wheel/identity', baseURL), {
        headers: { accept: 'application/json' }
      });
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        return (await response.json()) as Identity;
      }
      return null;
    } catch {
      await new Promise((wake) => setTimeout(wake, RETRY_MS));
    }
  }
  // Never came up. Playwright's own webServer wait reports that far better
  // than this can, so leave it to say so.
  return null;
}

/**
 * Whether a served root belongs to this checkout.
 *
 * The trailing slash in the prefix test is load-bearing: without it a checkout
 * at `/src/wheel` would accept a server rooted at `/src/wheel-other`, which is
 * exactly the confusion this whole check exists to end.
 */
export function servesThisCheckout(servedRoot: string, checkoutRoot: string): boolean {
  const served = servedRoot.replace(/\/$/, '');
  const root = checkoutRoot.replace(/\/$/, '');
  return served === root || served.startsWith(`${root}/`);
}

/** Every `*_BROWSER_BASE_URL` door a suite honours. */
const OVERRIDE_VARS = [
  'WEBSITE_BROWSER_BASE_URL',
  'TRACKER_BROWSER_BASE_URL',
  'DEMOS_BROWSER_BASE_URL'
] as const;

/** Explain a mismatch in terms of what to do about it. */
function mismatch(baseURL: string, served: string): string {
  return [
    `The server at ${baseURL} is not this checkout.`,
    ``,
    `  it is serving: ${served}`,
    `  tests are in:  ${repoRoot}`,
    ``,
    `Testing it would report on code you did not change. Each suite starts its`,
    `own server on a reserved port (scripts/test-ports.ts); a *_BROWSER_BASE_URL`,
    `override is the only way to reach past that. See AGENTS.md, "portless is`,
    `for humans, not for machines".`
  ].join('\n');
}

/** Fail the run when a server belongs to a different checkout — or, when named explicitly, will not say. */
export default async function verifyServerIdentity(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;
  const overrides = OVERRIDE_VARS.map((name) => [name, process.env[name]] as const).filter(
    (entry): entry is readonly [string, string] => Boolean(entry[1])
  );

  const targets = new Map<string, string | null>();
  if (baseURL) targets.set(baseURL, null);
  for (const [name, url] of overrides) targets.set(url, name);

  for (const [url, overriddenBy] of targets) {
    const identity = await identityOf(url);

    if (!identity?.root) {
      if (!overriddenBy) continue; // ours by construction; silence is fine
      throw new Error(
        [
          `${overriddenBy} points at ${url}, which will not identify itself.`,
          ``,
          `A wheel dev or preview server answers GET /__wheel/identity. Silence`,
          `means this is not one, or is running code that predates the check —`,
          `either way the suite cannot tell whose code it is about to test.`
        ].join('\n')
      );
    }

    if (servesThisCheckout(identity.root, repoRoot)) continue;
    throw new Error(mismatch(url, identity.root));
  }
}
