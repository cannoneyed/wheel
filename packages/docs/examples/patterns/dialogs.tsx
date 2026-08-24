import { Service, componentRoot, connect, view, viewRoot } from 'wheel/core';
import { DialogService } from 'wheel/kit';

import { BoardService } from './board-service';

class SelectionService extends Service {
  readonly selected = this.atom<readonly string[]>([], 'selected');
  readonly clear = this.action(() => this.selected.set([]));
}

// #region confirm
const connectBulkDeleteBar = connect('BulkDeleteBar', (context) => {
  const boardService = context.service(BoardService);
  const dialogService = context.service(DialogService);
  const selectionService = context.service(SelectionService);
  return view(
    { selected: selectionService.selected },
    {
      removeSelected: async () => {
        const ids = selectionService.selected.get();
        const confirmed = await dialogService.confirm(
          `Delete ${ids.length} selected cards?`,
          { danger: true, confirmLabel: 'Delete' }
        );
        if (confirmed) {
          ids.forEach(boardService.remove);
          selectionService.clear();
        }
      }
    }
  );
});
// #endregion confirm

export function BulkDeleteBar() {
  const state = connectBulkDeleteBar({});
  return (
    <button use:componentRoot onClick={state.removeSelected}>
      Delete {state.selected.length}
    </button>
  );
}

// #region custom-dialog
function DeleteItemDialog(props: {
  itemId: string;
  confirm: () => void;
  cancel: () => void;
}) {
  return (
    <div use:viewRoot={{ name: 'DeleteItemDialog', props }} role="dialog" aria-modal="true">
      <p>Delete {props.itemId}?</p>
      <button onClick={props.cancel}>Cancel</button>
      <button onClick={props.confirm}>Delete</button>
    </div>
  );
}

export function openDeleteDialog(
  dialogs: DialogService,
  board: BoardService,
  cardId: string
) {
  dialogs.openDialog('delete-item', DeleteItemDialog, {
    itemId: cardId,
    confirm: () => {
      board.remove(cardId);
      dialogs.closeDialog('delete-item');
    },
    cancel: () => dialogs.closeDialog('delete-item')
  });
}
// #endregion custom-dialog
