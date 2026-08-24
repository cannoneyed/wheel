import {
  defineAuthenticator,
  validateAuthPrincipal,
  type Authenticator
} from 'wheel/auth';

import type { TrackerServerConfig } from './config';

type Fetch = typeof fetch;

function credentialsFrom(request: Request): Headers {
  const headers = new Headers({ accept: 'application/json' });
  for (const name of ['authorization', 'cookie']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

/**
 * Demo mode trusts the explicit user/session headers used by the user
 * switcher. Production delegates verification to an application's session
 * endpoint and accepts only Wheel's provider-neutral principal shape.
 */
export function createTrackerAuthenticator(
  config: TrackerServerConfig,
  fetchSession: Fetch = fetch
): Authenticator {
  if (config.mode === 'demo') {
    return defineAuthenticator((request) => {
      const url = new URL(request.url);
      const userId =
        request.headers.get('x-axle-demo-user') ?? url.searchParams.get('demoUser');
      const sessionId =
        request.headers.get('x-axle-demo-session') ?? url.searchParams.get('demoSession');
      return userId && sessionId
        ? {
            actor: `user:${userId}`,
            workspaceId: config.workspaceId,
            sessionId
          }
        : null;
    });
  }

  const sessionUrl = config.authSessionUrl;
  if (!sessionUrl) {
    throw new Error('Production authentication requires authSessionUrl.');
  }
  return defineAuthenticator(async (request) => {
    const response = await fetchSession(sessionUrl, {
      method: 'GET',
      headers: credentialsFrom(request),
      signal: request.signal
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) {
      throw new Error(`Session verifier returned HTTP ${response.status}.`);
    }
    return validateAuthPrincipal(await response.json());
  });
}
