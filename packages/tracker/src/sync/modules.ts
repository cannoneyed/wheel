import * as activitySync from './activity.sync';
import * as commentsSync from './comments.sync';
import * as cyclesSync from './cycles.sync';
import * as favoritesSync from './favorites.sync';
import * as inboxSync from './inbox.sync';
import * as issuesSync from './issues.sync';
import * as projectsSync from './projects.sync';
import * as searchSync from './search.sync';
import * as teamsSync from './teams.sync';
import * as viewsSync from './views.sync';

/** Client-safe declaration modules shared by the Tracker browser and servers. */
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
