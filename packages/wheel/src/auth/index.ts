/**
 * wheel/auth — provider-neutral authentication contracts.
 *
 * Wheel does not verify cookies, bearer tokens, or provider sessions itself.
 * An application adapter verifies the Request and returns the identity Wheel
 * may trust. The sync HTTP boundary rejects missing or malformed principals.
 */

/** Identity established by server-side authentication, never by a sync request body. */
export interface AuthPrincipal {
  /** Stable application actor used by authorization checks and mutation provenance. */
  readonly actor: string;
  /** Workspace routed to this one-workspace SyncServer. */
  readonly workspaceId: string;
  /** Stable login/session identity used to bind a browser tab's connection. */
  readonly sessionId: string;
}

/** Server adapter that verifies a Request; null means no authenticated session. */
export interface Authenticator {
  authenticate(request: Request): AuthPrincipal | null | Promise<AuthPrincipal | null>;
}

/** Define an authenticator without coupling application code to an auth provider SDK. */
export function defineAuthenticator(
  authenticate: Authenticator['authenticate']
): Authenticator {
  return { authenticate };
}

/** Validate an authenticator result before it becomes trusted sync context. */
export function validateAuthPrincipal(value: unknown): AuthPrincipal {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Authenticator returned a non-object principal.');
  }
  const principal = value as Partial<AuthPrincipal>;
  const read = (field: keyof AuthPrincipal): string => {
    const fieldValue = principal[field];
    if (typeof fieldValue !== 'string' || fieldValue.trim() === '') {
      throw new TypeError(`Authenticator principal.${field} must be a non-empty string.`);
    }
    return fieldValue;
  };
  return Object.freeze({
    actor: read('actor'),
    workspaceId: read('workspaceId'),
    sessionId: read('sessionId')
  });
}
