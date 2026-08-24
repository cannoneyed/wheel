/**
 * The card's context menu — an ORDINARY connected component ("globally
 * rendered, locally connected"): declared at the trigger site, portaled by
 * ContextMenuSystem, fully aware of global services, locally fed by props.
 * Per-instance connect name so each open menu is auditable in the registry.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { ContextMenuService } from 'wheel/kit';

import { BoardService } from '../services/board-service';
import styles from './card-context-menu.module.css';

const connectCardContextMenu = connect(
  (props: { cardId: string }) => `contextMenu:card:${props.cardId}`,
  (c, props) => {
    const boardService = c.service(BoardService);
    const contextMenuService = c.service(ContextMenuService);
    return view(
      {
        card: () => boardService.list.rows.find((row) => row.id === props.cardId),
        columns: boardService.columns
      },
      {
        remove: () => void boardService.remove(props.cardId),
        moveTo: (columnId: string) => void boardService.moveToEnd(props.cardId, columnId),
        close: contextMenuService.close
      }
    );
  }
);

/** Menu content for one card: delete + one move entry per other column. */
export function CardContextMenu(props: { cardId: string }) {
  const state = connectCardContextMenu(props);
  return (
    <div use:componentRoot class={styles.menu}>
      <button
        class={styles.item}
        onClick={() => {
          state.remove();
          state.close();
        }}
      >
        Delete card
      </button>
      <Show when={state.card}>
        {(card) => (
          <For each={state.columns.filter((column) => column.id !== card().columnId)}>
            {(column) => (
              <button
                class={styles.item}
                onClick={() => {
                  state.moveTo(column.id);
                  state.close();
                }}
              >
                Move to {column.title}
              </button>
            )}
          </For>
        )}
      </Show>
    </div>
  );
}
