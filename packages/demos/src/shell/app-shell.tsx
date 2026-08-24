/**
 * The root layout: the shared wheel.dev bar, then sidebar left / route right.
 *
 * Mounted once for the life of the app. Every navigation swaps only what is
 * below the `<Outlet/>`, so the sidebar never re-renders and the demos' sync
 * clients keep their subscriptions across route changes.
 *
 * The bar is the same `SiteHeader` the landing page, /docs, and /components
 * render, and it carries the theme toggle — which is why the shell no longer
 * has one of its own in the sidebar foot.
 */
import { Outlet } from 'wheel/router';
import { viewRoot } from 'wheel/core';

import { SiteHeader } from '../../../docs/src/site/SiteHeader';
import { appRouter } from './routes';

/** Sidebar links plus the outlet the routed page renders into. */
export function AppShell() {
  // wheel-view-root: fragment with multiple top-level elements
  return (
    <>
      <SiteHeader active="demos" />
      <div use:viewRoot={'AppShell'} class="shell">
        {/* SHELL-04 counts the anchors in here: brand + eight demos, nothing
            else. The site bar above sits outside `.shell .sidebar`, so its
            links stay out of that count. */}
        <nav class="sidebar">
          <appRouter.Link to="home" class="brand" data-testid="nav-home">
            🥝 wheel demos
          </appRouter.Link>
          <span class="sidebar-label">Demos</span>
          <appRouter.Link to="todos" activeClass="active" data-testid="nav-todos">
            Todos
          </appRouter.Link>
          <appRouter.Link to="kanban" activeClass="active" data-testid="nav-kanban">
            Kanban
          </appRouter.Link>
          <appRouter.Link to="editor" activeClass="active" data-testid="nav-editor">
            Editor
          </appRouter.Link>
          <appRouter.Link to="sheet" activeClass="active" data-testid="nav-sheet">
            Spreadsheet
          </appRouter.Link>
          <appRouter.Link to="graph" activeClass="active" data-testid="nav-graph">
            Graph
          </appRouter.Link>
          <appRouter.Link to="sequencer" activeClass="active" data-testid="nav-sequencer">
            Sequencer
          </appRouter.Link>
          <appRouter.Link to="routing" activeClass="active" data-testid="nav-routing">
            Routing
          </appRouter.Link>
          <appRouter.Link to="framing" activeClass="active" data-testid="nav-framing">
            Framing
          </appRouter.Link>
        </nav>
        <main class="demo-main">
          <Outlet />
        </main>
      </div>
    </>
  );
}
