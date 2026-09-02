/**
 * One kanban card: click toggles selection, right-click opens the card's own
 * context-menu component, ◀ ▶ move it to the neighboring column's tail.
 */
import { Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { contextMenu } from 'wheel/kit';
import { Button } from 'wheel/components';

import { BoardService, type Card } from '../services/board-service';
import { SelectionService } from '../services/selection-service';
import { CardContextMenu } from './card-context-menu';
import styles from './board-card.module.css';

const connectBoardCard = connect('BoardCard', (c, props: { card: Card }) => {
  const boardService = c.service(BoardService);
  const selectionService = c.service(SelectionService);
  return view(
    {
      selected: () => selectionService.isSelected(props.card.id),
      neighbors: () => boardService.neighbors(props.card.columnId)
    },
    {
      toggleSelected: selectionService.toggle,
      moveToEnd: boardService.moveToEnd
    }
  );
});

/** Card title + tag chip + selection border + move buttons. */
export function BoardCard(props: { card: Card }) {
  const state = connectBoardCard(props);
  return (
    <article
      use:componentRoot
      class={styles.card}
      classList={{ [styles.cardSelected]: state.selected }}
      onClick={() => state.toggleSelected(props.card.id)}
      use:contextMenu={{ id: `card:${props.card.id}`, menu: () => <CardContextMenu cardId={props.card.id} /> }}
    >
      <div class={styles.header}>
        <span class={styles.title}>{props.card.title}</span>
        <span class={styles.tag}>{props.card.tag}</span>
      </div>
      <div class={styles.actions}>
        <Show when={state.neighbors.left}>
          {(left) => (
            <Button data-wheel-role="move"
              class={styles.move}
              title={`Move to ${left().title}`}
              onClick={(event) => {
                event.stopPropagation();
                state.moveToEnd(props.card.id, left().id);
              }}
            >
              ◀
            </Button>
          )}
        </Show>
        <Show when={state.neighbors.right}>
          {(right) => (
            <Button data-wheel-role="move"
              class={styles.move}
              title={`Move to ${right().title}`}
              onClick={(event) => {
                event.stopPropagation();
                state.moveToEnd(props.card.id, right().id);
              }}
            >
              ▶
            </Button>
          )}
        </Show>
      </div>
    </article>
  );
}
