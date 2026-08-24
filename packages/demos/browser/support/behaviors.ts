/**
 * Demo configuration for the public Wheel behavior harness.
 *
 * Every demo behavior runs against the standalone and embedded hosts. Demo
 * setup resets synced engines before the public harness records the run.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createBehaviorHarness,
  type BehaviorContext as WheelBehaviorContext,
  type BehaviorHost
} from 'wheel/testing/playwright';

import { portlessRoute } from '../../../../scripts/portless';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

/** Both topologies that each demo behavior must pass against. */
export const HOSTS: readonly BehaviorHost[] = [
  {
    name: 'standalone',
    origin:
      process.env.DEMOS_BROWSER_BASE_URL ??
      portlessRoute('wheel-demos-preview')?.url ??
      'http://127.0.0.1:4794',
    prefix: ''
  },
  {
    name: 'embedded',
    origin:
      process.env.WEBSITE_BROWSER_BASE_URL ??
      portlessRoute('wheel-website')?.url ??
      'http://127.0.0.1:4790',
    prefix: '/demos'
  }
];

/** Demos with a synced backend that must reset before each standalone behavior. */
const SYNC_DEMOS = new Set(['todos', 'kanban', 'editor', 'sheet', 'graph', 'sequencer']);

const harness = createBehaviorHarness<Page, APIRequestContext>({
  test: base,
  hosts: HOSTS,
  recordingsDir: join(repoRoot, 'recordings'),
  beforeBehavior: async ({ id, host, request }) => {
    const demo = id.split('-')[0]!.toLowerCase();
    if (host.name !== 'standalone' || !SYNC_DEMOS.has(demo)) return;
    const reset = await request.post(`${host.origin}/sync/${demo}/__reset`);
    if (!reset.ok()) {
      throw new Error(
        `engine reset failed (${reset.status()}) — the running demo server predates __reset; restart it`
      );
    }
  }
});

interface BehaviorOptions {
  /** Smoke behaviors run in `bun run check`; the full matrix runs in `check:behaviors`. */
  readonly smoke?: boolean;
}

/** The Playwright test object used by demo behavior specs. */
export const test = base;
export { expect };
export type BehaviorContext = WheelBehaviorContext<Page>;

/** Declare one spec behavior against both demo hosts. */
export function behavior(
  id: string,
  title: string,
  run: (context: BehaviorContext) => Promise<void>,
  options: BehaviorOptions = {}
): void {
  harness.behavior(id, title, run, { tags: options.smoke ? ['@smoke'] : [] });
}
