/** A star toggle for any favoritable target (detail header, project page). */
import { componentRoot, connect, view } from 'wheel/core';

import { FavoriteService } from '../../services/favorite-service';
import type { Favorite } from '../../sync/favorites.sync';
import styles from './favorite-star.module.css';

const connectFavoriteStar = connect(
  (props: { kind: Favorite['kind']; targetId: string }) => `FavoriteStar:${props.kind}:${props.targetId}`,
  (c, props: { kind: Favorite['kind']; targetId: string }) => {
    const favoriteService = c.service(FavoriteService);
    return view(
      { starred: () => favoriteService.favoriteOf(props.kind, props.targetId) !== undefined },
      { toggle: favoriteService.toggle }
    );
  }
);

/** ☆/★ toggle. */
export function FavoriteStar(props: { kind: Favorite['kind']; targetId: string }) {
  const state = connectFavoriteStar(props);
  return (
    <button
      use:componentRoot
      class={styles.star}
      classList={{ [styles.starred]: state.starred }}
      title={state.starred ? 'Remove from favorites' : 'Add to favorites'}
      onClick={() => state.toggle(props.kind, props.targetId)}
    >
      {state.starred ? '★' : '☆'}
    </button>
  );
}
