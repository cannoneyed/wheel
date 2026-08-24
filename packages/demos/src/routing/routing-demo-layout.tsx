/**
 * The routing demo's own layout: team links, history controls, the live state
 * panel, and an `<Outlet/>` for whichever page is nested inside.
 *
 * This component stays mounted while everything below it changes — which is
 * the point of a layout, and what the "layout survives a param change" test in
 * the browser suite asserts.
 */
import { For } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { Outlet, type RouterService } from 'wheel/router';
import { Button } from 'wheel/components';

import { appRouter, type DemoRoutes } from '../shell/routes';
import styles from './routing.module.css';
import { RouterStatePanel } from './router-state-panel';
import { RoutingDemoService } from './services/routing-demo-service';

const connectRoutingDemoLayout = connect('RoutingDemoLayout', (c) => {
  const router = c.service(appRouter.Service) as RouterService<DemoRoutes>;
  const data = c.service(RoutingDemoService);
  return view({ teams: data.teams }, { back: router.back, forward: router.forward });
});

/** Routing-demo chrome: navigation, history buttons, live state, and the outlet. */
export function RoutingDemoLayout() {
  const state = connectRoutingDemoLayout({});
  return (
    <div use:componentRoot class={styles.demo} data-testid="routing-demo">
      <header class={styles.nav}>
        <appRouter.Link to="routing.overview" activeClass={styles.active} data-testid="nav-overview">
          Overview
        </appRouter.Link>
        <For each={state.teams}>
          {(team) => (
            <appRouter.Link
              to="routing.team.issues"
              params={{ teamId: team.id }}
              activeClass={styles.active}
              data-testid={`nav-team-${team.id}`}
            >
              {team.name}
            </appRouter.Link>
          )}
        </For>
        <appRouter.Link to="routing.crash" activeClass={styles.active} data-testid="nav-crash">
          Broken page
        </appRouter.Link>
        {/* wheel-raw-anchor: a deliberate full page load onto a URL the table
            does not know, proving both the SPA fallback and the not-found page
            on a cold boot. BASE_URL keeps the load inside the app's mount
            (/demos/... in the embedded host) so the app's 404 answers, not the
            host site's index. */}
        <a href={`${import.meta.env.BASE_URL}routing/does-not-exist`} data-testid="nav-broken">
          Broken link
        </a>
        <span class={styles.spacer} />
        <Button type="button" onClick={() => state.back()} data-testid="history-back">
          ← Back
        </Button>
        <Button type="button" onClick={() => state.forward()} data-testid="history-forward">
          Forward →
        </Button>
      </header>
      <div class={styles.body}>
        <main class={styles.main}>
          <Outlet />
        </main>
        <RouterStatePanel />
      </div>
    </div>
  );
}
