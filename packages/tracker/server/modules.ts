/** Tracker declarations and server bindings shared by Bun and Cloudflare boot. */
import * as activityServer from '../src/sync/activity.server';
import * as commentsServer from '../src/sync/comments.server';
import * as cyclesServer from '../src/sync/cycles.server';
import * as favoritesServer from '../src/sync/favorites.server';
import * as inboxServer from '../src/sync/inbox.server';
import * as issuesServer from '../src/sync/issues.server';
import * as projectsServer from '../src/sync/projects.server';
import * as searchServer from '../src/sync/search.server';
import * as teamsServer from '../src/sync/teams.server';
import * as viewsServer from '../src/sync/views.server';
import { TRACKER_SYNC_MODULES } from '../src/sync/modules';

export { TRACKER_SYNC_MODULES };

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
