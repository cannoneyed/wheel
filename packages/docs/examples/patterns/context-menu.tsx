import { For } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { ContextMenuService } from 'wheel/kit';

import { BoardService } from './board-service';

const connectCardContextMenu = connect(
  (props: { cardId: string }) => `contextMenu:card:${props.cardId}`,
  (context, props: { cardId: string }) => {
    const boardService = context.service(BoardService);
    const contextMenuService = context.service(ContextMenuService);
    return view(
      {
        card: () =>
          boardService.cards.get().find((row) => row.id === props.cardId),
        columns: boardService.columns
      },
      {
        remove: () => boardService.remove(props.cardId),
        moveTo: (columnId: string) =>
          boardService.moveToEnd(props.cardId, columnId),
        close: contextMenuService.close
      }
    );
  }
);

export function CardContextMenu(props: { cardId: string }) {
  const state = connectCardContextMenu(props);
  return (
    <div use:componentRoot role="menu">
      <button role="menuitem" onClick={state.remove}>Delete</button>
      <For each={state.columns}>
        {(columnId) => (
          <button role="menuitem" onClick={() => state.moveTo(columnId)}>
            Move to {columnId}
          </button>
        )}
      </For>
    </div>
  );
}
