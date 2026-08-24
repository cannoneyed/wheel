/**
 * The sidebar Favorites section: display-resolved via
 * FavoriteService, manual order, ▲▼ reorder (positionBetween's third
 * consumer), click navigates by kind.
 */
import { For } from 'solid-js';
import { Show, componentRoot, connect, view } from 'wheel/core';

import { FavoriteService } from '../../services/favorite-service';
import type { RouterService } from 'wheel/router';

import { trackerRouter, type TrackerRoutes } from '../../routes';
import styles from './sidebar.module.css';

const connectFavoritesNav = connect('FavoritesNav', (c) => {
  const favoriteService = c.service(FavoriteService);
  const router = c.service(trackerRouter.Service) as RouterService<TrackerRoutes>;
  return view(
    { favorites: favoriteService.favoriteVms },
    {
      navigate: router.navigate,
      reorder: favoriteService.reorder,
      remove: favoriteService.toggle
    }
  );
});

/** Renders nothing until something is starred. */
export function FavoritesNav() {
  const state = connectFavoritesNav({});
  const navigate = (kind: string, targetId: string) => {
    if (kind === 'issue') state.navigate('issue', { params: { issueId: targetId } });
    else if (kind === 'project') state.navigate('project', { params: { projectId: targetId } });
    else if (kind === 'team') state.navigate('team.issues', { params: { teamId: targetId } });
  };
  const move = (index: number, delta: number) => {
    const list = state.favorites;
    const target = list[index].favorite;
    const destination = index + delta;
    if (destination < 0 || destination >= list.length) return;
    // Land between the destination row and its neighbor beyond.
    const beyond = list[destination + delta]?.favorite.position;
    const neighbor = list[destination].favorite.position;
    state.reorder(target.id, delta < 0 ? beyond : neighbor, delta < 0 ? neighbor : beyond);
  };
  return (
    <Show when={state.favorites.length > 0}>
      <div use:componentRoot class={styles.section}>
        <div class={styles.sectionLabel}>Favorites</div>
        <For each={state.favorites}>
          {(vm, index) => (
            <div class={styles.favoriteRow}>
              <button class={styles.item} onClick={() => navigate(vm.favorite.kind, vm.favorite.targetId)}>
                <span class={styles.teamIcon}>{vm.icon}</span>
                {vm.title}
              </button>
              <button class={styles.favoriteTool} title="Move up" onClick={() => move(index(), -1)}>
                ▲
              </button>
              <button class={styles.favoriteTool} title="Move down" onClick={() => move(index(), 1)}>
                ▼
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
