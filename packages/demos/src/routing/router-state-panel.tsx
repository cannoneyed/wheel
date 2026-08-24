/**
 * The router's state, on screen, live.
 *
 * This panel is the whole "routing is just state" claim made visible: it reads
 * the same atom and computeds the router runs on, through an ordinary connect
 * declaration. Nothing here is a router-specific debugging API — the debug
 * panel shows exactly these values for the same reason.
 */
import { componentRoot, connect, view } from 'wheel/core';
import type { RouterService } from 'wheel/router';

import { appRouter, type DemoRoutes } from '../shell/routes';
import styles from './routing.module.css';

const connectRouterStatePanel = connect('RouterStatePanel', (c) => {
  const router = c.service(appRouter.Service) as RouterService<DemoRoutes>;
  return view({
    url: router.url,
    name: router.routeName,
    params: router.params,
    search: router.search,
    chain: () => router.match()?.chain ?? []
  });
});

/** Live readout of url, matched route, chain, params, and search. */
export function RouterStatePanel() {
  const state = connectRouterStatePanel({});
  return (
    <aside use:componentRoot class={styles.state} data-testid="router-state">
      <h3>Router state</h3>
      <dl>
        <dt>url</dt>
        <dd data-testid="state-url">{state.url}</dd>
        <dt>route</dt>
        <dd data-testid="state-name">{state.name ?? '(no match)'}</dd>
        <dt>chain</dt>
        <dd data-testid="state-chain">{state.chain.join(' › ') || '—'}</dd>
        <dt>params</dt>
        <dd data-testid="state-params">{JSON.stringify(state.params)}</dd>
        <dt>search</dt>
        <dd data-testid="state-search">{JSON.stringify(state.search)}</dd>
      </dl>
    </aside>
  );
}
