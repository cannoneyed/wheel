/**
 * The main pane: a title bar that names the current route, the sync badge, and
 * the `<Outlet/>` every routed page renders into.
 *
 * This is the router's ROOT component, so it mounts once and stays mounted.
 * The old version owned a `<Switch>` over a route union; that dispatch is now
 * the route table's job, which is why this file is mostly a header.
 */
import { componentRoot, connect, view } from 'wheel/core';
import { Outlet, type RouterService } from 'wheel/router';

import { trackerRouter, type TrackerRoutes } from '../../routes';
import { TeamService } from '../../services/team-service';
import { ThemeService } from '../../services/theme-service';
import { SyncBadge } from './sync-badge';
import styles from './app-shell.module.css';

const TITLES: Record<string, string> = {
  inbox: 'Inbox',
  myIssues: 'My Issues',
  home: 'Axle'
};

const connectRoutedMain = connect('RoutedMain', (c) => {
  const router = c.service(trackerRouter.Service) as RouterService<TrackerRoutes>;
  const teamService = c.service(TeamService);
  // dom boundary: read the theme already in effect (index.html's pre-paint
  // script, else the OS preference) into the atom once at shell setup.
  c.service(ThemeService).apply();
  return view({
    title: () => {
      const teamId = router.matchOf('team')?.params.teamId;
      if (teamId !== undefined) return teamService.team(teamId)?.name ?? '…';
      return TITLES[router.routeName() ?? 'home'] ?? 'Axle';
    }
  });
});

/** Title bar plus the routed content beneath it. */
export function RoutedMain() {
  const state = connectRoutedMain({});
  return (
    <main use:componentRoot class={styles.main}>
      <header class={styles.mainHeader}>
        <h1 class={styles.mainTitle}>{state.title}</h1>
        <SyncBadge />
      </header>
      <div class={styles.content}>
        <Outlet />
      </div>
    </main>
  );
}
