/**
 * The board grid: the loading note plus one BoardColumn per static column.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { BoardService } from '../services/board-service';
import { BoardColumn } from './board-column';
import styles from './board.module.css';

const connectBoard = connect('Board', (c) => {
  const boardService = c.service(BoardService);
  return view({
    columns: boardService.columns,
    status: () => boardService.list.status
  });
});

/** The three-column board. */
export function Board() {
  const state = connectBoard({});
  return (
    <div use:componentRoot>
      <Show when={state.status.kind === 'loading'}>
        <span class="stale-note">loading… (first boot with no cache and no server waits here)</span>
      </Show>
      <div class={styles.board}>
        <For each={state.columns}>{(column) => <BoardColumn column={column} />}</For>
      </div>
    </div>
  );
}
