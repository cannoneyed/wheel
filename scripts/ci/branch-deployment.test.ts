import { describe, expect, test, vi } from 'vitest';

import { branchKey } from './branch-key';
import { enableWorkersDev } from './cloudflare-api';
import { planBranchCleanup, workerNamesForBranches } from './cleanup-branches';
import {
  deploymentPlan,
  deployUrlFromOutput,
  waitForOk,
  waitForWorkerNames
} from './deploy-branch';

describe('branch Worker names', () => {
  test('are stable, safe, bounded, and collision-resistant', () => {
    const first = branchKey('Feature/Auth');
    expect(first).toBe(branchKey('Feature/Auth'));
    expect(first).toMatch(/^[a-z0-9-]+-[a-f0-9]{8}$/);
    expect(branchKey('feature/auth')).not.toBe(branchKey('feature-auth'));
    expect(`wheel-tracker-${branchKey('feature/'.repeat(30))}`.length).toBeLessThan(64);
  });
});

describe('branch deployment', () => {
  test('routes main to wheel.dev and leaves other branches on preview Workers', () => {
    expect(deploymentPlan('main')).toMatchObject({
      production: true,
      site: {
        name: 'wheel-site',
        config: 'wrangler.website.production.jsonc',
        publicUrl: 'https://wheel.dev'
      }
    });
    expect(deploymentPlan('feature/auth')).toMatchObject({
      production: false,
      site: {
        name: `wheel-site-${branchKey('feature/auth')}`,
        config: 'wrangler.website.jsonc'
      }
    });
  });

  test('reads the Workers URL from Wrangler structured output', () => {
    const line = JSON.stringify({
      type: 'deploy',
      worker_name: 'wheel-site-test',
      targets: [{ url: 'https://wheel-site-test.example.workers.dev/' }]
    });
    expect(deployUrlFromOutput(line, 'wheel-site-test')).toBe(
      'https://wheel-site-test.example.workers.dev'
    );
  });

  test('accepts a Workers hostname without a protocol', () => {
    const line = JSON.stringify({
      type: 'deploy',
      worker_name: 'wheel-tracker-test',
      targets: ['wheel-tracker-test.example.workers.dev']
    });
    expect(deployUrlFromOutput(line, 'wheel-tracker-test')).toBe(
      'https://wheel-tracker-test.example.workers.dev'
    );
  });

  test('reports Wrangler deployment details when no URL is returned', () => {
    const line = JSON.stringify({
      type: 'deploy',
      worker_name: 'wheel-site-test',
      version_id: 'version-test',
      worker_name_overridden: true,
      targets: []
    });
    expect(() => deployUrlFromOutput(line, 'wheel-site-test')).toThrow(
      '"version_id":"version-test"'
    );
  });

  test('retries smoke checks until the Worker is ready', async () => {
    const fetchUrl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('wait', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok'));
    await waitForOk('https://worker.test', {
      attempts: 2,
      fetch: fetchUrl,
      delay: async () => {}
    });
    expect(fetchUrl).toHaveBeenCalledTimes(2);
  });

  test('does not accept a stale website from the previous origin', async () => {
    const fetchUrl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('old site'))
      .mockResolvedValueOnce(
        new Response('current site', { headers: { 'x-wheel-commit': 'commit-current' } })
      );
    await waitForOk('https://wheel.dev', {
      attempts: 2,
      expectedCommit: 'commit-current',
      fetch: fetchUrl,
      delay: async () => {}
    });
    expect(fetchUrl).toHaveBeenCalledTimes(2);
  });

  test('explicitly enables the workers.dev route', async () => {
    const fetchUrl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: {} }), {
        headers: { 'content-type': 'application/json' }
      })
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchUrl;
    try {
      await enableWorkersDev(
        { accountId: 'account', apiToken: 'token' },
        'wheel-site-test'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(fetchUrl).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account/workers/scripts/wheel-site-test/subdomain',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ enabled: true, previews_enabled: false })
      })
    );
  });

  test('waits until Cloudflare lists both deployed Workers', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'wheel-site-test' }])
      .mockResolvedValueOnce([
        { id: 'wheel-site-test' },
        { id: 'wheel-tracker-test' }
      ]);
    await waitForWorkerNames(['wheel-site-test', 'wheel-tracker-test'], {
      attempts: 2,
      list,
      delay: async () => {}
    });
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe('branch cleanup', () => {
  const now = Date.parse('2026-08-21T12:00:00.000Z');
  const key = branchKey('feature/auth');
  const workers = [
    { id: `wheel-site-${key}`, tags: ['keep'] },
    { id: `wheel-tracker-${key}`, tags: [] }
  ];

  test('marks a missing pair before it deletes anything', () => {
    const actions = planBranchCleanup({ scripts: workers, liveWorkers: new Set(), now });
    expect(actions.map((action) => action.type)).toEqual(['mark', 'mark']);
    expect(actions.every((action) => action.type !== 'delete')).toBe(true);
  });

  test('deletes both Workers after the seven-day hold', () => {
    const orphan = 'orphaned-at:2026-08-13T11:59:59.000Z';
    const actions = planBranchCleanup({
      scripts: workers.map((worker) => ({ ...worker, tags: [...worker.tags, orphan] })),
      liveWorkers: new Set(),
      now
    });
    expect(actions).toEqual([
      { type: 'delete', worker: `wheel-site-${key}` },
      { type: 'delete', worker: `wheel-tracker-${key}` }
    ]);
  });

  test('clears orphan marks when the branch returns', () => {
    const worker = `wheel-site-${key}`;
    const actions = planBranchCleanup({
      scripts: [{ id: worker, tags: ['keep', 'orphaned-at:2026-08-20T12:00:00.000Z'] }],
      liveWorkers: new Set([worker]),
      now
    });
    expect(actions).toEqual([{ type: 'clear', worker, tags: ['keep'] }]);
  });

  test('retires the old main website preview but keeps the main tracker', () => {
    const mainKey = branchKey('main');
    const featureKey = branchKey('feature/auth');
    expect([...workerNamesForBranches(['main', 'feature/auth'])].sort()).toEqual(
      [
        `wheel-site-${featureKey}`,
        `wheel-tracker-${featureKey}`,
        `wheel-tracker-${mainKey}`
      ].sort()
    );
  });
});
