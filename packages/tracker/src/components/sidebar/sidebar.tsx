/**
 * The Axle sidebar: workspace header (theme toggle), fixed sections
 * (inbox, my issues, favorites), per-team sections with saved views, and
 * the actor switcher in the footer.
 */
import { For } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import type { RouterService } from 'wheel/router';

import { trackerRouter, type TrackerRoutes } from '../../routes';
import { TeamService } from '../../services/team-service';
import { ProjectNav } from './project-nav';
import { InboxNav } from './inbox-nav';
import { FavoritesNav } from './favorites-nav';
import { TeamViewList } from './team-view-list';
import { ThemeService } from '../../services/theme-service';
import { UserSwitcher } from './user-switcher';
import styles from './sidebar.module.css';

const connectSidebar = connect('Sidebar', (c) => {
  const teamService = c.service(TeamService);
  const router = c.service(trackerRouter.Service) as RouterService<TrackerRoutes>;
  const themeService = c.service(ThemeService);
  return view(
    {
      teams: teamService.teams,
      teamId: () => router.matchOf('team')?.params.teamId ?? null,
      routeName: router.routeName,
      theme: themeService.theme
    },
    {
      navigate: router.navigate,
      toggleTheme: themeService.toggle
    }
  );
});

/** The app sidebar. Mounted once by the shell. */
export function Sidebar() {
  const state = connectSidebar({});
  return (
    <nav use:componentRoot class={styles.sidebar}>
      <div class={styles.workspace}>
        <span>◎ Axle</span>
        <button
          class={styles.themeButton}
          title="Toggle theme"
          onClick={() => state.toggleTheme()}
        >
          {state.theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
      <InboxNav />
      <FavoritesNav />
      <div class={styles.section}>
        <div class={styles.sectionLabel}>Teams</div>
        <For each={state.teams}>
          {(team) => (
            <>
              <button
                class={
                  state.teamId === team.id ? `${styles.item} ${styles.itemActive}` : styles.item
                }
                onClick={() => state.navigate('team.issues', { params: { teamId: team.id } })}
              >
                <span class={styles.teamIcon} style={{ color: team.color }}>
                  {team.icon}
                </span>
                {team.name}
                <span class={styles.teamKey}>{team.key}</span>
              </button>
              <button
                class={
                  state.teamId === team.id && state.routeName === 'team.board'
                    ? `${styles.subItem} ${styles.itemActive}`
                    : styles.subItem
                }
                onClick={() => state.navigate('team.board', { params: { teamId: team.id } })}
              >
                Board
              </button>
              <button
                class={
                  state.teamId === team.id && state.routeName === 'team.cycles'
                    ? `${styles.subItem} ${styles.itemActive}`
                    : styles.subItem
                }
                onClick={() => state.navigate('team.cycles', { params: { teamId: team.id } })}
              >
                Cycles
              </button>
              <TeamViewList teamId={team.id} />
            </>
          )}
        </For>
      </div>
      <ProjectNav />
      <div class={styles.footer}>
        <UserSwitcher />
      </div>
    </nav>
  );
}
