// @vitest-environment jsdom
/**
 * Full Tracker render smoke. This imports and mounts the real shell/component
 * tree over a real World client so component roots, registrations, live
 * queries, and the seeded first screen fail together instead of only in E2E.
 */
import { render } from 'solid-js/web';
import { describe, expect, test } from 'vitest';

import { WheelProvider } from 'wheel/core';
import { World } from 'wheel/testing';

import * as activityServer from '../src/sync/activity.server';
import * as activitySync from '../src/sync/activity.sync';
import * as commentsServer from '../src/sync/comments.server';
import * as commentsSync from '../src/sync/comments.sync';
import * as cyclesServer from '../src/sync/cycles.server';
import * as cyclesSync from '../src/sync/cycles.sync';
import * as favoritesServer from '../src/sync/favorites.server';
import * as favoritesSync from '../src/sync/favorites.sync';
import * as inboxServer from '../src/sync/inbox.server';
import * as inboxSync from '../src/sync/inbox.sync';
import * as issuesServer from '../src/sync/issues.server';
import * as issuesSync from '../src/sync/issues.sync';
import * as projectsServer from '../src/sync/projects.server';
import * as projectsSync from '../src/sync/projects.sync';
import * as searchServer from '../src/sync/search.server';
import * as searchSync from '../src/sync/search.sync';
import * as teamsServer from '../src/sync/teams.server';
import * as teamsSync from '../src/sync/teams.sync';
import * as viewsServer from '../src/sync/views.server';
import * as viewsSync from '../src/sync/views.sync';
import { AppShell } from '../src/components/shell/app-shell';
import { applySeed, SEED } from '../seed/seed';
import { TRACKER_DDL } from '../server/schema';

describe('Tracker component tree', () => {
  test('mounts the seeded team screen through real services and sync', async () => {
    const world = await World.create({
      syncModules: [
        teamsSync,
        issuesSync,
        commentsSync,
        activitySync,
        projectsSync,
        cyclesSync,
        inboxSync,
        searchSync,
        viewsSync,
        favoritesSync
      ],
      servers: [
        teamsServer,
        issuesServer,
        commentsServer,
        activityServer,
        projectsServer,
        cyclesServer,
        inboxServer,
        searchServer,
        viewsServer,
        favoritesServer
      ],
      setup: async (db) => {
        for (const statement of TRACKER_DDL) await db.query(statement);
        await applySeed(db);
      }
    });
    const actor = SEED.users[0];
    const team = SEED.teams[0];
    const client = await world.client('web_component_render', {
      actor: `user:${actor.id}`
    });
    sessionStorage.setItem('axle.actorId', actor.id);
    // Path routing now: put jsdom's address bar on the deep URL before mount,
    // so the router's browser history reads it at construction.
    window.history.replaceState(null, '', `/teams/${team.id}/issues`);
    const host = document.createElement('div');
    document.body.append(host);
    const dispose = render(
      () => (
        <WheelProvider client={client}>
          <AppShell />
        </WheelProvider>
      ),
      host
    );

    try {
      await world.settle();
      expect(host.querySelector('h1')?.textContent).toBe(team.name);
      expect(
        host.querySelectorAll('[data-testid^="issue-title-"]').length
      ).toBeGreaterThan(0);
      expect(
        host.querySelector<HTMLButtonElement>('button[title="New issue (c)"]')
      ).not.toBeNull();
      expect(host.querySelector('[data-testid="sync-badge"]')).not.toBeNull();
      host
        .querySelector<HTMLButtonElement>(
          'button[title="Open a second, independently-filtered pane"]'
        )!
        .click();
      expect(
        host.querySelector('[data-wheel-frame="tracker-secondary"]')
      ).not.toBeNull();
    } finally {
      dispose();
      host.remove();
      await world.close();
    }
  });
});
