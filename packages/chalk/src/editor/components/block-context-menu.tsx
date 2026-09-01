/**
 * One Chalk block's context menu — an ORDINARY connected component ("globally
 * rendered, locally connected"): declared at the trigger site (the document
 * editor), portaled by ContextMenuSystem, fully aware of global services,
 * locally fed by props. Per-instance connect name so each open menu is
 * auditable in the registry. "Turn into" is the same setKind mutation the
 * markdown prefixes and slash menu use; delete goes through the confirm
 * dialog.
 */
import { For } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { ContextMenuService, DialogService } from 'wheel/kit';

import { EditorService, type Kind } from '../services/editor-service';

import styles from './block-context-menu.module.css';

const TURN_INTO: ReadonlyArray<{ kind: Kind; label: string }> = [
  { kind: 'paragraph', label: 'Text' },
  { kind: 'h1', label: 'Heading 1' },
  { kind: 'h2', label: 'Heading 2' },
  { kind: 'h3', label: 'Heading 3' },
  { kind: 'bullet', label: 'Bulleted list' },
  { kind: 'todo', label: 'To-do' },
  { kind: 'quote', label: 'Quote' },
  { kind: 'code', label: 'Code' }
];

const connectBlockContextMenu = connect(
  (props: { blockId: string }) => `contextMenu:block:${props.blockId}`,
  (c, props) => {
    const editorService = c.service(EditorService);
    const dialogService = c.service(DialogService);
    const contextMenuService = c.service(ContextMenuService);
    return view(
      {
        kind: () => editorService.block(props.blockId)?.kind
      },
      {
        setKind: (kind: Kind) => editorService.setKind(props.blockId, kind),
        moveUp: () => editorService.moveUp(props.blockId),
        moveDown: () => editorService.moveDown(props.blockId),
        confirmDelete: () => dialogService.confirm('Delete this block?', { danger: true }),
        remove: () => editorService.remove(props.blockId),
        close: contextMenuService.close
      }
    );
  }
);

/** Menu content for one block: turn into / move / delete (confirmed). */
export function BlockContextMenu(props: { blockId: string }) {
  const state = connectBlockContextMenu(props);
  // Close the menu first (restoring focus), then confirm, then mutate — the
  // dialog resolves false on cancel/scrim/Escape, so cancel deletes nothing.
  const requestDelete = async () => {
    state.close();
    if (await state.confirmDelete()) {
      state.remove();
    }
  };
  return (
    <div use:componentRoot class={styles.menu}>
      <span class={styles.heading}>Turn into</span>
      <For each={TURN_INTO}>
        {(item) => (
          <button
            class={styles.item}
            classList={{ [styles.current]: state.kind === item.kind }}
            onClick={() => {
              state.setKind(item.kind);
              state.close();
            }}
          >
            {item.label}
          </button>
        )}
      </For>
      <hr class={styles.rule} />
      <button
        class={styles.item}
        onClick={() => {
          state.moveUp();
          state.close();
        }}
      >
        Move up
      </button>
      <button
        class={styles.item}
        onClick={() => {
          state.moveDown();
          state.close();
        }}
      >
        Move down
      </button>
      <button class={`${styles.item} ${styles.danger}`} onClick={() => void requestDelete()}>
        Delete block
      </button>
    </div>
  );
}
