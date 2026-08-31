/**
 * Kanban sync module: the shared client/server contract. Both sides compile
 * against these declarations; the optimistic handlers here must mirror the
 * server handlers in kanban.server.ts (same writes, same id order).
 *
 * Ordering doctrine: `position` is a float SORT KEY (positionBetween), not a
 * list index — a move is always ONE row write, so concurrent moves of
 * different cards compose instead of conflicting.
 */
import { mutation, query, t, collection } from 'wheel/sync';

/** One kanban card as it lives in SQLite and every client cache. */
export const CardRow = t.object({
  id: t.string(),
  title: t.string(),
  tag: t.string(),
  columnId: t.string(),
  position: t.number()
});

export const cards = collection({ name: 'cards', type: CardRow, key: (row) => row.id });

/** All cards, position-sorted; the columns split them client-side. */
export const cardList = query({
  name: 'cards.list',
  params: t.object({}),
  into: cards,
  projection: {
    filter: () => true,
    sort: (a, b) => a.position - b.position
  }
});

export const addCard = mutation({
  name: 'cards.add',
  args: t.object({ columnId: t.string(), title: t.string(), tag: t.string() }),
  optimistic: (cache, args, ctx) => {
    // Tail of the target column: max position + 1 (mirrors the server's
    // coalesce(max(position), -1) + 1).
    const tail = cache
      .list(cards)
      .filter((card) => card.columnId === args.columnId)
      .reduce((max, card) => Math.max(max, card.position), -1);
    cache.put(cards, {
      id: ctx.newId('card'),
      title: args.title,
      tag: args.tag,
      columnId: args.columnId,
      position: tail + 1
    });
  }
});

export const moveCard = mutation({
  name: 'cards.move',
  args: t.object({ cardId: t.string(), columnId: t.string(), position: t.number() }),
  optimistic: (cache, args) => {
    cache.update(cards, args.cardId, { columnId: args.columnId, position: args.position });
  }
});

export const deleteCard = mutation({
  name: 'cards.delete',
  args: t.object({ cardId: t.string() }),
  optimistic: (cache, args) => {
    cache.delete(cards, args.cardId);
  }
});

export const deleteCards = mutation({
  name: 'cards.deleteMany',
  args: t.object({ cardIds: t.array(t.string()) }),
  optimistic: (cache, args) => {
    for (const cardId of args.cardIds) {
      cache.delete(cards, cardId);
    }
  }
});
