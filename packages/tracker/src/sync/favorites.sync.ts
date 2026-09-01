/**
 * Favorites: per-user starred entities with manual fractional
 * ordering — the third `positionBetween` consumer. Per-user by params (the
 * same trust model as the inbox).
 */
import { mutation, orphan, query, t, collection, type Infer, type InverseSpec } from 'wheel/sync';

/** One favorite: what kind of thing, which one, where in the list. */
export const FavoriteRow = t.object({
  id: t.string(),
  userId: t.string(),
  kind: t.enum(['issue', 'project', 'team', 'view']),
  targetId: t.string(),
  position: t.number()
});

/** The favorites collection. */
export const favorites = collection({ name: 'favorites', type: FavoriteRow, key: (row) => row.id });

/** The current user's favorites in manual order. */
export const favoritesMine = query({
  name: 'favorites.mine',
  params: t.object({ userId: t.string() }),
  into: favorites,
  projection: {
    filter: (row, params) => row.userId === params.userId,
    sort: (a, b) => a.position - b.position || (a.id < b.id ? -1 : 1)
  }
});

/** Star something (id args-borne). Inverse: unstar it. */
export const favoriteAdd = mutation({
  name: 'favorites.add',
  args: t.object({
    favoriteId: t.string(),
    kind: t.enum(['issue', 'project', 'team', 'view']),
    targetId: t.string(),
    position: t.number()
  }),
  optimistic: (cache, args, ctx) => {
    cache.put(favorites, {
      id: args.favoriteId,
      userId: ctx.actor.replace(/^user:/, ''),
      kind: args.kind,
      targetId: args.targetId,
      position: args.position
    });
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: favoriteRemove,
    args: { favoriteId: args.favoriteId },
    description: 'add favorite'
  })
});

/** Unstar. Inverse: star it back at the same position. */
export const favoriteRemove = mutation({
  name: 'favorites.remove',
  args: t.object({ favoriteId: t.string() }),
  optimistic: (cache, args) => {
    cache.delete(favorites, args.favoriteId);
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(favorites, args.favoriteId);
    if (!row) return null;
    return {
      mutation: favoriteAdd,
      args: { favoriteId: row.id, kind: row.kind, targetId: row.targetId, position: row.position },
      description: 'remove favorite'
    };
  }
});

/** Reorder within the favorites list (one fractional write). Inverse: back. */
export const favoriteReorder = mutation({
  name: 'favorites.reorder',
  args: t.object({ favoriteId: t.string(), position: t.number() }),
  optimistic: (cache, args) => {
    if (!cache.get(favorites, args.favoriteId)) throw orphan(`favorite ${args.favoriteId} is gone`);
    cache.update(favorites, args.favoriteId, { position: args.position });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(favorites, args.favoriteId);
    if (!row) return null;
    return {
      mutation: favoriteReorder,
      args: { favoriteId: args.favoriteId, position: row.position },
      description: 'reorder favorite'
    };
  }
});

/** Favorite alias. */
export type Favorite = Infer<typeof FavoriteRow>;
