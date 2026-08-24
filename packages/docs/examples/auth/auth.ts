import { defineAuthenticator, validateAuthPrincipal } from 'wheel/auth';

/** Adapt one application session endpoint to Wheel's principal contract. */
export function sessionAuthenticator(sessionUrl: string) {
  return defineAuthenticator(async (request) => {
    const response = await fetch(sessionUrl, {
      headers: { cookie: request.headers.get('cookie') ?? '' },
      signal: request.signal
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error(`Session verifier: HTTP ${response.status}`);
    return validateAuthPrincipal(await response.json());
  });
}
