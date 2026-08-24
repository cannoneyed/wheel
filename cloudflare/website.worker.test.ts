import { expect, test } from 'vitest';

import { fetchWebsite } from './website-worker';

test('serves each website entry point from its own index', async () => {
  const requested: string[] = [];
  const env = {
    ASSETS: {
      async fetch(request: Request) {
        const path = new URL(request.url).pathname;
        requested.push(path);
        // The deployed tree: every entry point's index, hashed assets, and the
        // plain files served at the root and under /robots (see
        // packages/website/robot-docs-plugin.ts).
        if (path.endsWith('/index.html')) return new Response(path);
        if (path.startsWith('/demos/assets/')) return new Response(path);
        if (path === '/llms.txt' || path === '/install.md') return new Response(path);
        if (path.startsWith('/robots/') && path.endsWith('.md')) return new Response(path);
        return new Response('missing', { status: 404 });
      }
    }
  };

  expect(await (await fetchWebsite(new Request('https://wheel.test/docs/install'), env)).text()).toBe(
    '/docs/index.html'
  );
  expect(await (await fetchWebsite(new Request('https://wheel.test/components/dialog'), env)).text()).toBe(
    '/components/index.html'
  );
  expect(await (await fetchWebsite(new Request('https://wheel.test/demos/todos'), env)).text()).toBe(
    '/demos/index.html'
  );
  expect(await (await fetchWebsite(new Request('https://wheel.test/demos/assets/app.js'), env)).text()).toBe(
    '/demos/assets/app.js'
  );
  expect(await (await fetchWebsite(new Request('https://wheel.test/'), env)).text()).toBe(
    '/index.html'
  );
  expect(await (await fetchWebsite(new Request('https://wheel.test/guide'), env)).text()).toBe(
    '/index.html'
  );
  // Root-level assets are reachable again, so nothing routes through a copy of
  // index.html nested under /shell/ any more.
  expect(await (await fetchWebsite(new Request('https://wheel.test/llms.txt'), env)).text()).toBe(
    '/llms.txt'
  );
  // A directory inside the robot docs resolves to its README, not the app.
  expect(await (await fetchWebsite(new Request('https://wheel.test/robots/api/'), env)).text()).toBe(
    '/robots/api/README.md'
  );
  expect(await (await fetchWebsite(new Request('https://wheel.test/robots'), env)).text()).toBe(
    '/robots/README.md'
  );
  expect(
    await (await fetchWebsite(new Request('https://wheel.test/robots/state.md'), env)).text()
  ).toBe('/robots/state.md');

  expect(requested).toEqual([
    '/docs/index.html',
    '/components/index.html',
    '/demos/index.html',
    '/demos/assets/app.js',
    '/index.html',
    '/index.html',
    '/llms.txt',
    '/robots/api/README.md',
    '/robots/README.md',
    '/robots/state.md'
  ]);
});

test('marks every production response with its deployed commit', async () => {
  const response = await fetchWebsite(new Request('https://wheel.dev/'), {
    DEPLOY_COMMIT: 'commit-test',
    ASSETS: { fetch: async () => new Response('website') }
  });

  expect(response.headers.get('x-wheel-commit')).toBe('commit-test');
  expect(await response.text()).toBe('website');
});
