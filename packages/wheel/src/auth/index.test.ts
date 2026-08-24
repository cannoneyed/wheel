import { describe, expect, test } from 'vitest';
import { defineAuthenticator, validateAuthPrincipal } from './index';

describe('auth contracts', () => {
  test('defineAuthenticator preserves an async provider adapter', async () => {
    const authenticator = defineAuthenticator(async () => ({
      actor: 'user:ada',
      workspaceId: 'workspace:one',
      sessionId: 'session:one'
    }));
    await expect(
      authenticator.authenticate(new Request('https://app.test/sync'))
    ).resolves.toEqual({
      actor: 'user:ada',
      workspaceId: 'workspace:one',
      sessionId: 'session:one'
    });
  });

  test.each(['actor', 'workspaceId', 'sessionId'] as const)(
    'principal.%s must be a non-empty string',
    (field) => {
      expect(() =>
        validateAuthPrincipal({
          actor: 'user:ada',
          workspaceId: 'workspace:one',
          sessionId: 'session:one',
          [field]: ''
        })
      ).toThrow(new RegExp(`principal\\.${field}`));
    }
  );

  test('validated principals are immutable', () => {
    const principal = validateAuthPrincipal({
      actor: 'user:ada',
      workspaceId: 'workspace:one',
      sessionId: 'session:one'
    });
    expect(Object.isFrozen(principal)).toBe(true);
  });
});
