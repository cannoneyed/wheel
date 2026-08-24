import { ServiceProvider, Service, componentRoot, connect, view, viewRoot } from 'wheel/core';
import { Outlet, createRouter, memoryHistoryOverride, type RouterService } from 'wheel/router';
import { z } from 'zod';

class TeamTitleService extends Service {
  readonly prefix = this.atom('Team', 'prefix');
}

function AppShell() {
  return (
    <div use:viewRoot={'AppShell'}>
      <appRouter.Link to="home">Home</appRouter.Link>
      <appRouter.Link to="team.issues" params={{ teamId: 'core' }} activeClass="active">
        Core issues
      </appRouter.Link>
      <Outlet />
    </div>
  );
}

const routes = {
  path: '/',
  component: AppShell,
  children: {
    home: { path: '/', component: () => <h1>Home</h1> },
    team: {
      path: 'teams/$teamId',
      component: TeamLayout,
      search: z.object({ status: z.enum(['all', 'open']).default('all') }),
      children: {
        issues: { path: 'issues', component: () => <p>Issues</p> },
        board: { path: 'board', component: () => <p>Board</p> }
      }
    }
  }
} as const;

/** The tree's type, for services that name the router's generic. */
export type Routes = typeof routes;

export const appRouter = createRouter(routes, { name: 'AppRouter' });

const connectTeamLayout = connect('TeamLayout', (c) => {
  const router = c.service(appRouter.Service) as RouterService<Routes>;
  const titles = c.service(TeamTitleService);
  const match = () => router.matchOf('team');
  return view(
    {
      prefix: titles.prefix,
      teamId: () => match()?.params.teamId ?? '',
      status: () => match()?.search.status ?? 'all'
    },
    { navigate: router.navigate }
  );
});

function TeamLayout() {
  const state = connectTeamLayout({});
  return (
    <main use:componentRoot>
      <h1>
        {state.prefix} {state.teamId} ({state.status})
      </h1>
      <button
        type="button"
        onClick={() =>
          state.navigate('team.board', { params: { teamId: state.teamId }, search: { status: 'open' } })
        }
      >
        Open board
      </button>
      <Outlet />
    </main>
  );
}

export function App() {
  return (
    <ServiceProvider scopeId="app">
      <appRouter.Root />
    </ServiceProvider>
  );
}

export function AppForTest(initialPath: string) {
  return (
    <ServiceProvider scopeId="app" overrides={[memoryHistoryOverride([initialPath])]}>
      <appRouter.Root />
    </ServiceProvider>
  );
}
