/**
 * Static website Worker with one fallback file per Vite entry point.
 *
 * The dotless fallback used to point at `/shell/index.html`, a copy of
 * `dist/index.html` that `website:build` made by hand. The root file itself was
 * unreachable: the deploy step's `dist/**\/*` download glob skipped every file
 * at the top of `dist/`, so the copy in a subdirectory was the only one that
 * survived. That glob is fixed, the copy is gone, and this points at the real
 * file.
 */
export interface WebsiteAssets {
  fetch(request: Request): Promise<Response>;
}

export interface WebsiteEnv {
  ASSETS: WebsiteAssets;
  /** Buildkite commit injected by Wrangler. The deploy smoke check requires it. */
  DEPLOY_COMMIT?: string;
}

function nestedAppShell(pathname: string): string | undefined {
  if (pathname === '/docs' || pathname.startsWith('/docs/')) return '/docs/index.html';
  if (pathname === '/components' || pathname.startsWith('/components/')) {
    return '/components/index.html';
  }
  if (pathname.startsWith('/demos/assets/')) return undefined;
  if (pathname === '/demos' || pathname.startsWith('/demos/')) return '/demos/index.html';
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) return undefined;
  // The robot docs are a file tree, not an app: a directory in it means the
  // README beside those files, never the landing page. An agent that trims a
  // path back to its directory has to land on documentation.
  if (pathname === '/robots' || pathname.startsWith('/robots/')) {
    return `${pathname.replace(/\/$/, '')}/README.md`;
  }
  return '/index.html';
}

/** Route each app path to a nested shell that Cloudflare serves reliably. */
export async function fetchWebsite(request: Request, env: WebsiteEnv): Promise<Response> {
  let response: Response;
  if (request.method === 'GET' || request.method === 'HEAD') {
    const url = new URL(request.url);
    const shell = nestedAppShell(url.pathname);
    if (shell) {
      url.pathname = shell;
      url.search = '';
      response = await env.ASSETS.fetch(new Request(url, request));
    } else {
      response = await env.ASSETS.fetch(request);
    }
  } else {
    response = await env.ASSETS.fetch(request);
  }
  if (!env.DEPLOY_COMMIT) return response;
  const deployed = new Response(response.body, response);
  deployed.headers.set('x-wheel-commit', env.DEPLOY_COMMIT);
  return deployed;
}

export default {
  fetch: fetchWebsite
};
