// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { betterSqlite3Driver } from 'wheel/sync/server';

import { createTrackerAuthenticator } from '../server/auth';
import { loadTrackerServerConfig } from '../server/config';
import { applyTrackerMigrations } from '../server/schema';

const productionEnvironment = {
  TRACKER_MODE: 'production',
  TRACKER_PORT: '8080',
  TRACKER_WORKSPACE_ID: 'workspace-acme',
  TRACKER_DATABASE_FILENAME: './data/acme.sqlite',
  TRACKER_AUTH_SESSION_URL: 'https://auth.example.test/session',
  TRACKER_MAX_BODY_BYTES: '1024',
  TRACKER_REQUESTS_PER_MINUTE: '30'
} as const;

describe('Tracker production server seams', () => {
  test('production config refuses every unsafe demo default', () => {
    expect(() => loadTrackerServerConfig({ TRACKER_MODE: 'production' })).toThrow(
      /TRACKER_WORKSPACE_ID|production mode/
    );
    expect(() =>
      loadTrackerServerConfig({
        ...productionEnvironment,
        TRACKER_DATABASE_FILENAME: ':memory:'
      })
    ).toThrow(/persistent SQLite file/);

    expect(loadTrackerServerConfig(productionEnvironment)).toEqual({
      mode: 'production',
      port: 8080,
      workspaceId: 'workspace-acme',
      databaseFilename: './data/acme.sqlite',
      authSessionUrl: 'https://auth.example.test/session',
      maxBodyBytes: 1024,
      requestsPerMinute: 30
    });
  });

  test('external auth forwards credentials only and validates the principal', async () => {
    let forwarded: Request | undefined;
    const fetchSession = (async (input: RequestInfo | URL, init?: RequestInit) => {
      forwarded = new Request(input, init);
      return new Response(
        JSON.stringify({
          actor: 'user:ada',
          workspaceId: 'workspace-acme',
          sessionId: 'session-1'
        }),
        { headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;
    const authenticator = createTrackerAuthenticator(
      loadTrackerServerConfig(productionEnvironment),
      fetchSession
    );

    await expect(
      authenticator.authenticate(
        new Request('https://tracker.example.test/sync/websocket', {
          headers: {
            authorization: 'Bearer secret',
            cookie: 'session=secret',
            'x-axle-demo-user': 'attacker'
          }
        })
      )
    ).resolves.toEqual({
      actor: 'user:ada',
      workspaceId: 'workspace-acme',
      sessionId: 'session-1'
    });
    expect(forwarded?.headers.get('authorization')).toBe('Bearer secret');
    expect(forwarded?.headers.get('cookie')).toBe('session=secret');
    expect(forwarded?.headers.has('x-axle-demo-user')).toBe(false);
  });

  test('schema migrations are transactional and run once', () => {
    const driver = betterSqlite3Driver(':memory:');
    applyTrackerMigrations(driver);
    applyTrackerMigrations(driver);

    expect(
      driver.all('select version, name from _axle_schema_migrations')
    ).toEqual([{ version: 1, name: 'initial_tracker_schema' }]);
    expect(
      driver.all(
        `select name from sqlite_master
         where type = 'table' and name in ('issues', 'notifications', 'issue_fts')
         order by name`
      )
    ).toEqual([
      { name: 'issue_fts' },
      { name: 'issues' },
      { name: 'notifications' }
    ]);
    driver.close();
  });
});
