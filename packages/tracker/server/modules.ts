/** Tracker declarations and server bindings shared by Bun and Cloudflare boot. */
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

export const TRACKER_SYNC_MODULES = [
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
] as const;

export const TRACKER_SERVERS = [
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
] as const;

/** Input shared by the checked-in JSON contract generator and both server runtimes. */
export const TRACKER_SCHEMA_SPEC_INPUT = {
  syncModules: [...TRACKER_SYNC_MODULES],
  servers: [...TRACKER_SERVERS]
};
