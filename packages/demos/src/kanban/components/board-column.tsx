/**
 * One board column: header with count, the visible (tag-filtered) cards, and
 * the add-card form.
 */
import { For } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { BoardService, type Column } from '../services/board-service';
import { BoardCard } from './board-card';
import { AddCardForm } from './add-card-form';
import styles from './board-column.module.css';

const connectBoardColumn = connect('BoardColumn', (c, props: { column: Column }) => {
  const boardService = c.service(BoardService);
  return view({
    cards: () => boardService.cardsIn(props.column.id)
  });
});

/** Title + cards + add form for one column. */
export function BoardColumn(props: { column: Column }) {
  const state = connectBoardColumn(props);
  return (
    <section use:componentRoot class={styles.column}>
      <h2 class={styles.title}>
        {props.column.title} · {state.cards.length}
      </h2>
      <div class={styles.cards}>
        <For each={state.cards}>{(card) => <BoardCard card={card} />}</For>
      </div>
      <AddCardForm columnId={props.column.id} />
    </section>
  );
}
