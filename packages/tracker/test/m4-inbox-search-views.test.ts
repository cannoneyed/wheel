// @vitest-environment node
/**
 * Inbox / search / views tests: notification fan-out (+@mentions, one-undo mark-all), the
 * custom search handler (declared dependencies AND the push channel), saved views,
 * favorites, split-view scope isolation, and the headless shortcut map.
 */
import { describe, expect, test } from 'vitest';

import { ServiceContext, fakeService } from 'wheel/core';
import { KeyboardService } from 'wheel/kit';
import { World } from 'wheel/testing';

import * as teamsSync from '../src/sync/teams.sync';
import * as teamsServer from '../src/sync/teams.server';
import * as issuesSync from '../src/sync/issues.sync';
import * as issuesServer from '../src/sync/issues.server';
import * as commentsSync from '../src/sync/comments.sync';
import * as commentsServer from '../src/sync/comments.server';
import * as activitySync from '../src/sync/activity.sync';
import * as activityServer from '../src/sync/activity.server';
import * as projectsSync from '../src/sync/projects.sync';
import * as projectsServer from '../src/sync/projects.server';
import * as cyclesSync from '../src/sync/cycles.sync';
import * as cyclesServer from '../src/sync/cycles.server';
import * as inboxSync from '../src/sync/inbox.sync';
import * as inboxServer from '../src/sync/inbox.server';
import * as searchSync from '../src/sync/search.sync';
import * as searchServer from '../src/sync/search.server';
import * as viewsSync from '../src/sync/views.sync';
import * as viewsServer from '../src/sync/views.server';
import * as favoritesSync from '../src/sync/favorites.sync';
import * as favoritesServer from '../src/sync/favorites.server';
import { TEAMS_DDL } from '../src/sync/teams.server';
import { ISSUES_DDL } from '../src/sync/issues.server';
import { COMMENTS_DDL } from '../src/sync/comments.server';
import { ACTIVITY_DDL } from '../src/sync/activity.server';
import { PROJECTS_DDL } from '../src/sync/projects.server';
import { CYCLES_DDL } from '../src/sync/cycles.server';
import { INBOX_DDL } from '../src/sync/inbox.server';
import { VIEWS_DDL } from '../src/sync/views.server';
import { FAVORITES_DDL } from '../src/sync/favorites.server';
import { searchInvalidation, SEARCH_DDL } from '../src/sync/search.server';
import { parseMentions } from '../src/sync/inbox.server';
import { applySeed, SEED, seedStateId } from '../seed/seed';
import { IssueService } from '../src/services/issue-service';
import { TeamService } from '../src/services/team-service';
import { CommentService } from '../src/services/comment-service';
import { InboxService } from '../src/services/inbox-service';
import { ViewOptionsService } from '../src/services/view-options-service';
import { ViewService } from '../src/services/view-service';
import { FavoriteService } from '../src/services/favorite-service';
import { SelectionService } from '../src/services/selection-service';
import { IssueInteractionService } from '../src/services/issue-interaction-service';
import { PaneService } from '../src/services/pane-service';
import { UserService } from '../src/services/user-service';
import { searchQuery } from '../src/sync/search.sync';

const TEAM = SEED.teams[0].id;
const TODO_STATE = seedStateId(0, 1);
const ADA = SEED.users[0].id;
const GRACE = SEED.users[1].id;

async function makeWorld(): Promise<World> {
  return World.create({
    syncModules: [
      teamsSync, issuesSync, commentsSync, activitySync, projectsSync, cyclesSync,
      inboxSync, searchSync, viewsSync, favoritesSync
    ],
    servers: [
      teamsServer, issuesServer, commentsServer, activityServer, projectsServer, cyclesServer,
      inboxServer, searchServer, viewsServer, favoritesServer
    ],
    setup: async (db) => {
      for (const statement of [
        ...TEAMS_DDL, ...ISSUES_DDL, ...COMMENTS_DDL, ...ACTIVITY_DDL,
        ...PROJECTS_DDL, ...CYCLES_DDL, ...INBOX_DDL, ...VIEWS_DDL, ...FAVORITES_DDL,
        ...SEARCH_DDL
      ]) {
        await db.query(statement);
      }
      await applySeed(db);
    }
  });
}

async function session(world: World, clientId: string, userId: string) {
  const client = await world.client(clientId, { actor: `user:${userId}` });
  const context = new ServiceContext({ client });
  context.override(
    UserService,
    fakeService(UserService, { actorId: { get: () => userId } as unknown as UserService['actorId'] }),
    { ownership: 'caller' }
  );
  const issues = context.get(IssueService);
  issues.issuesFor(TEAM);
  await world.settle();
  return { client, context, issues };
}

describe('inbox / search / views / favorites / split', () => {
  test('fan-out: assignment and @mention land in the right inboxes; mark-all is ONE undo step', async () => {
    const world = await makeWorld();
    const ada = await session(world, 'web_a', ADA);
    const grace = await session(world, 'web_b', GRACE);
    const graceInbox = grace.context.get(InboxService);
    graceInbox.notifications();
    await world.settle();
    // Track by id, never by position: the fixed test clock sorts new rows
    // BEHIND the 2026-dated seed rows.
    const baselineIds = new Set(graceInbox.notifications().map((entry) => entry.id));
    const baselineUnread = graceInbox.unreadCount();

    // Ada assigns Grace → 'assigned'; Ada @mentions Grace in a comment → 'mention'.
    const target = ada.issues.issuesIn(TEAM, TODO_STATE)[0];
    ada.issues.update(target.id, { assigneeId: GRACE });
    await world.settle();
    ada.context.get(CommentService).create(target.id, 'Ping @Grace — can you take a look?');
    await world.settle();

    const fresh = graceInbox.notifications().filter((entry) => !baselineIds.has(entry.id));
    expect(fresh.some((entry) => entry.kind === 'assigned')).toBe(true);
    expect(fresh.some((entry) => entry.kind === 'mention')).toBe(true);
    expect(graceInbox.unreadCount()).toBeGreaterThan(baselineUnread);

    // Mark all read in one mutation; one undo restores every prior state.
    graceInbox.markAllRead();
    await world.settle();
    expect(graceInbox.unreadCount()).toBe(0);
    grace.client.undo();
    await world.settle();
    expect(graceInbox.unreadCount()).toBeGreaterThan(baselineUnread);
    await world.close();
  });

  test('parseMentions matches first names, case-insensitively, and ignores unknowns', () => {
    const users = SEED.users.map((user) => ({ id: user.id, name: user.name }));
    expect(parseMentions('ping @grace and @ADA about this', users).sort()).toEqual([ADA, GRACE].sort());
    expect(parseMentions('email bob@grace.com is not a mention of nobody', users)).toEqual([GRACE]);
    expect(parseMentions('no mentions here', users)).toEqual([]);
  });

  test('personal inbox and favorite queries are bound to the authenticated actor', async () => {
    const world = await makeWorld();
    const ada = await session(world, 'web_private_a', ADA);
    const grace = await session(world, 'web_private_b', GRACE);

    const target = ada.issues.issuesIn(TEAM, TODO_STATE)[0];
    ada.issues.update(target.id, { assigneeId: GRACE });
    grace.context.get(FavoriteService).toggle('issue', target.id);
    await world.settle();

    const stolenInbox = await ada.client.subscribe(inboxSync.notificationsInbox, {
      userId: GRACE
    });
    const stolenFavorites = await ada.client.subscribe(favoritesSync.favoritesMine, {
      userId: GRACE
    });
    await world.settle();
    expect(stolenInbox.rows()).toEqual([]);
    expect(stolenFavorites.rows()).toEqual([]);

    stolenInbox.release();
    stolenFavorites.release();
    await world.close();
  });

  test('search: the custom handler ranks live results and honors BOTH invalidation channels', async () => {
    const world = await makeWorld();
    const ada = await session(world, 'web_c', ADA);
    const needle = 'zanzibar';

    const handle = await ada.client.subscribe(searchQuery, { q: needle });
    await world.settle();
    expect(handle.rows().length).toBe(0);

    // Channel 1 — dependencies: an engine mutation touching `issues` re-runs the search.
    const target = ada.issues.issuesIn(TEAM, TODO_STATE)[0];
    ada.issues.update(target.id, { title: `Investigate the ${needle} regression` });
    await world.settle();
    expect(handle.rows().map((row) => row.id)).toContain(target.id);

    // Channel 2 — push: a DIRECT db write (no engine, no touch trigger, no
    // hint) becomes visible when something pokes the push channel.
    const second = ada.issues.issuesIn(TEAM, TODO_STATE)[1];
    await world.db.query(`update issues set title = ? where id = ?`, [
      `The second ${needle} sighting`,
      second.id
    ]);
    expect(handle.rows().map((row) => row.id)).not.toContain(second.id);
    searchInvalidation.notify();
    await world.settle();
    expect(handle.rows().map((row) => row.id)).toContain(second.id);
    await world.close();
  });

  test('saved views: snapshot → save → converge → apply round-trips the filters', async () => {
    const world = await makeWorld();
    const ada = await session(world, 'web_d', ADA);
    const grace = await session(world, 'web_e', GRACE);
    const adaOptions = ada.context.get(ViewOptionsService);
    const adaViews = ada.context.get(ViewService);
    const graceViews = grace.context.get(ViewService);
    graceViews.viewsFor(TEAM);

    adaOptions.togglePriority(1);
    adaOptions.toggleState(TODO_STATE);
    adaOptions.setOrdering('priority');
    const snapshot = adaOptions.snapshot();
    const viewId = adaViews.create(TEAM, 'Urgent todo', snapshot.filters, snapshot.display);
    await world.settle();

    // Converged to Grace, who applies it into HER (fresh) pane options.
    const saved = graceViews.savedView(TEAM, viewId);
    expect(saved?.name).toBe('Urgent todo');
    const graceOptions = grace.context.get(ViewOptionsService);
    expect(graceOptions.hasFilters()).toBe(false);
    graceOptions.applySnapshot(saved!.filters, saved!.display);
    expect([...graceOptions.priorities.get()]).toEqual([1]);
    expect([...graceOptions.states.get()]).toEqual([TODO_STATE]);
    expect(graceOptions.ordering.get()).toBe('priority');
    await world.close();
  });

  test('favorites: star, converge to the same user elsewhere, reorder, unstar undo', async () => {
    const world = await makeWorld();
    const tabA = await session(world, 'web_f', ADA);
    const tabB = await session(world, 'web_g', ADA); // same user, second tab
    const favoritesA = tabA.context.get(FavoriteService);
    const favoritesB = tabB.context.get(FavoriteService);
    favoritesB.favorites();
    await world.settle();

    const [first, second] = tabA.issues.issuesIn(TEAM, TODO_STATE);
    favoritesA.toggle('issue', first.id);
    favoritesA.toggle('issue', second.id);
    await world.settle();
    expect(favoritesB.favorites().map((row) => row.targetId)).toEqual([first.id, second.id]);

    // Reorder: move the second above the first (one fractional write).
    const rows = favoritesA.favorites();
    favoritesA.reorder(rows[1].id, undefined, rows[0].position);
    await world.settle();
    expect(favoritesB.favorites().map((row) => row.targetId)).toEqual([second.id, first.id]);

    favoritesA.toggle('issue', first.id); // unstar
    await world.settle();
    expect(favoritesB.favorites().map((row) => row.targetId)).toEqual([second.id]);
    tabA.client.undo();
    await world.settle();
    expect(favoritesB.favorites().some((row) => row.targetId === first.id)).toBe(true);
    await world.close();
  });

  test('split view: live services shared across the child scope, plain services isolated, secondary registers no bindings', async () => {
    const world = await makeWorld();
    const ada = await session(world, 'web_h', ADA);
    const primaryInteraction = ada.context.get(IssueInteractionService);
    void primaryInteraction;
    const keyboard = ada.context.get(KeyboardService);
    const bindingsBefore = keyboard.registrations().length;
    expect(bindingsBefore).toBeGreaterThan(20); // the primary map is registered

    const pane = ada.context.child({ scopeId: 'pane:secondary', inheritServices: 'live' });
    pane.override(
      PaneService,
      fakeService(PaneService, { isPrimary: (() => false) as PaneService['isPrimary'] }),
      { ownership: 'caller' }
    );

    // LIVE services resolve to the SAME instance (shared synced data)…
    expect(pane.get(IssueService)).toBe(ada.context.get(IssueService));
    // …plain services isolate per pane…
    expect(pane.get(SelectionService)).not.toBe(ada.context.get(SelectionService));
    expect(pane.get(ViewOptionsService)).not.toBe(ada.context.get(ViewOptionsService));
    // …and isolated state proves it: filters/selection diverge, data agrees.
    const paneOptions = pane.get(ViewOptionsService);
    paneOptions.togglePriority(1);
    expect(ada.context.get(ViewOptionsService).hasFilters()).toBe(false);
    expect(paneOptions.hasFilters()).toBe(true);
    pane.get(SelectionService).setCursor('issue_x');
    expect(ada.context.get(SelectionService).cursor.get()).toBeNull();

    // The secondary interaction facade constructed but registered NOTHING new.
    pane.get(IssueInteractionService);
    expect(keyboard.registrations().length).toBe(bindingsBefore);
    pane.dispose();
    await world.close();
  });

  test('the shortcut map, headless: registrations are described and dispatch routes correctly', async () => {
    const world = await makeWorld();
    const ada = await session(world, 'web_i', ADA);
    const interaction = ada.context.get(IssueInteractionService);
    ada.context.get(TeamService).states(TEAM);
    await world.settle();
    const keyboard = ada.context.get(KeyboardService);

    // The full documented map exists (spot-check the shortcut combos).
    const keys = keyboard.registrations().map((binding) => binding.key);
    for (const combo of ['j', 'k', 'x', 'space', 'enter', 's', 'a', 'p', 'l', 'shift+p', 'shift+c', 'c', 'e', 'mod+z', 'shift+mod+z', 'mod+/', 'shift+?', 'g', 'mod+backspace']) {
      expect(keys).toContain(combo);
    }
    // Every registration that shows in help is described.
    expect(keyboard.registrations().filter((binding) => binding.description).length).toBeGreaterThan(15);

    // Headless dispatch: `j` moves the cursor once the team list is the route.
    const fakeKey = (key: string, extra: Partial<KeyboardEvent> = {}) =>
      ({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: null,
        preventDefault: () => {},
        ...extra
      }) as unknown as KeyboardEvent;
    // Under node the router falls back to an in-memory history, so navigate()
    // moves the URL atom with no window involved.
    const { trackerRouter } = await import('../src/routes');
    ada.context.get(trackerRouter.Service).navigate('team.issues', { params: { teamId: TEAM } });

    const selection = ada.context.get(SelectionService);
    expect(selection.cursor.get()).toBeNull();
    expect(keyboard.dispatch(fakeKey('j'))).toBe(true);
    const first = selection.cursor.get();
    expect(first).not.toBeNull();
    keyboard.dispatch(fakeKey('j'));
    expect(selection.cursor.get()).not.toBe(first);
    // KeyboardService passes the KeyboardEvent to bindings. The command
    // adapter must not leak it into actions whose optional argument is an id.
    expect(keyboard.dispatch(fakeKey('e'))).toBe(true);
    expect(interaction.editingId.get()).toBe(selection.cursor.get());
    interaction.cancelEdit();
    // `x` selects the cursor row; escape clears the selection.
    keyboard.dispatch(fakeKey('x'));
    expect(selection.hasSelection()).toBe(true);
    expect(keyboard.dispatch(fakeKey('Escape'))).toBe(true);
    expect(selection.hasSelection()).toBe(false);
    await world.close();
  });
});
