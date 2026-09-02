/**
 * Chalk undo/redo buttons for the toolbar row — disabled states track the
 * client's history stacks, and the buttons NEVER unmount (the toolbar's
 * no-layout-shift rule). The same undo/redo also rides mod+z / mod+shift+z
 * (registered by EditorService), so buttons and shortcuts stay one code path.
 */
import Redo2 from 'lucide-solid/icons/redo-2';
import Undo2 from 'lucide-solid/icons/undo-2';
import { componentRoot, connect, view } from 'wheel/core';
import { Button } from 'wheel/components';

import { EditorService } from '../services/editor-service';
import styles from './history-controls.module.css';

const connectHistoryControls = connect('HistoryControls', (c) => {
  const editorService = c.service(EditorService);
  return view(
    {
      canUndo: editorService.canUndo,
      canRedo: editorService.canRedo
    },
    {
      undo: editorService.undo,
      redo: editorService.redo
    }
  );
});

/** The toolbar's undo/redo button pair. */
export function HistoryControls() {
  const state = connectHistoryControls({});
  // preventDefault on mousedown: the click must not steal focus from the
  // editor, or the cursor the undo is about to re-place would be lost first
  // (the standard toolbar-button dance).
  const keepFocus = (event: MouseEvent) => event.preventDefault();
  return (
    <span use:componentRoot class={styles.controls}>
      <Button data-wheel-role="undo"
        class={styles.iconButton}
        title="Undo (mod+z)"
        disabled={!state.canUndo}
        onMouseDown={keepFocus}
        onClick={state.undo}
      >
        <Undo2 size={14} />
      </Button>
      <Button data-wheel-role="redo"
        class={styles.iconButton}
        title="Redo (mod+shift+z)"
        disabled={!state.canRedo}
        onMouseDown={keepFocus}
        onClick={state.redo}
      >
        <Redo2 size={14} />
      </Button>
    </span>
  );
}
