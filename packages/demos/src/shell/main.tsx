/**
 * Demo shell entry: one `ServiceProvider` and the router's root.
 *
 * The provider here is CLIENTLESS — the shell's own state (the router, the
 * routing demo's data) is local. Each sync demo mounts its own `WheelProvider`
 * with its own client further down, so switching routes never disturbs another
 * demo's subscriptions.
 */
import { render } from 'solid-js/web';
import { ServiceProvider, setWheelDevMode } from 'wheel/core';
import { basedHistoryOverride } from 'wheel/router';

import './styles.css';

import { appRouter } from './routes';

// The demos SHOWCASE wheel's debug story — the docked panel, the component
// tree, and the window.__wheel bridge stay on even in the production build
// the standalone host serves (SHELL-15/16 assert exactly this). Real apps
// get these only in dev; this is the deliberate opt-in.
setWheelDevMode(true);

// Under the embed build the app mounts at /demos/ (vite's BASE_URL); the
// router keeps matching root paths while the address bar carries the prefix.
const base = import.meta.env.BASE_URL;

render(
  () => (
    <ServiceProvider scopeId="demos" overrides={base === '/' ? [] : [basedHistoryOverride(base)]}>
      <appRouter.Root />
    </ServiceProvider>
  ),
  document.getElementById('root')!
);
