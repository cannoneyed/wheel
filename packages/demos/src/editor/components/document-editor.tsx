/**
 * THE editor — one tiptap instance, many blocks, wheel owns the state.
 *
 * This component is the meeting point of the two projection flows:
 *   rows → doc: a createEffect watches `blocks()` and patches the doc
 *     minimally (projection.ts), holding back the dirty block.
 *   doc → rows: gestures (behavior.ts) become mutations immediately; plain
 *     typing marks the block dirty and commits after ~800ms of quiet, on
 *     leaving the block, or when undo needs it flushed (D1).
 *
 * Everything view-local lives here as plain fields/signals (dirty state,
 * commit timer, slash menu); everything synced lives in EditorService.
 */
import { For, Show, createEffect, onCleanup } from 'solid-js';
import { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { componentRoot, connect, useSignal, view } from 'wheel/core';
import { contextMenu } from 'wheel/kit';
import { Button } from 'wheel/components';

import { EditorService, type Block, type BlockPeer, type Kind } from '../services/editor-service';
import { schemaExtensions } from '../tiptap/schema';
import { gestureExtension, selectInBlock, sliceText, type GestureHooks } from '../tiptap/behavior';
import { PresenceExtension, updatePresence } from '../tiptap/presence';
import { REMOTE_META, docJsonFromRows, positionedBlocks, projectRowsIntoTransaction, textOfNode } from '../tiptap/projection';
import { BlockContextMenu } from './block-context-menu';
import styles from './document-editor.module.css';

/** How long typing can pause before the dirty block commits. */
const COMMIT_PAUSE_MS = 800;

const SLASH_ITEMS: ReadonlyArray<{ kind: Kind; label: string }> = [
  { kind: 'paragraph', label: 'Text' },
  { kind: 'h1', label: 'Heading 1' },
  { kind: 'h2', label: 'Heading 2' },
  { kind: 'h3', label: 'Heading 3' },
  { kind: 'bullet', label: 'Bulleted list' },
  { kind: 'number', label: 'Numbered list' },
  { kind: 'todo', label: 'To-do' },
  { kind: 'quote', label: 'Quote' },
  { kind: 'code', label: 'Code' },
  { kind: 'divider', label: 'Divider' }
];

interface SlashState {
  blockId: string;
  query: string;
  index: number;
  x: number;
  y: number;
}

const connectDocumentEditor = connect('DocumentEditor', (c) => {
  const editorService = c.service(EditorService);
  return view(
    {
      blocks: () => editorService.list.rows,
      status: () => editorService.list.status,
      peersByBlock: (): ReadonlyMap<string, readonly BlockPeer[]> => {
        const map = new Map<string, readonly BlockPeer[]>();
        for (const block of editorService.list.rows) {
          const peers = editorService.peersOn(block.id);
          if (peers.length > 0) {
            map.set(block.id, peers);
          }
        }
        return map;
      }
    },
    {
      rowOf: (blockId: string): Block | undefined => editorService.block(blockId),
      commit: editorService.commit,
      setKind: editorService.setKind,
      setChecked: editorService.setChecked,
      split: editorService.split,
      merge: editorService.merge,
      remove: editorService.remove,
      add: editorService.add,
      publishCursor: editorService.publishCursor,
      registerFlushHook: (hook: () => void) => editorService.registerFlushHook(hook)
    }
  );
});

function findNode(doc: ProseMirrorNode, blockId: string): ProseMirrorNode | null {
  return positionedBlocks(doc).find((block) => block.id === blockId)?.node ?? null;
}

/** The single-editor document surface (see module doc). */
export function DocumentEditor() {
  const state = connectDocumentEditor({});
  let container!: HTMLDivElement;
  let wrapper!: HTMLDivElement;
  let editor: Editor | null = null;

  // Dirty-typing state: which block has uncommitted keystrokes, and the row
  // version those keystrokes started from (the commit's baseVersion, D3).
  let dirtyBlockId: string | null = null;
  let dirtyBaseVersion = 0;
  let commitTimer: ReturnType<typeof setTimeout> | undefined;

  const [conflictNote, setConflictNote] = useSignal<string | null>(null, 'conflictNote');
  const [slash, setSlash] = useSignal<SlashState | null>(null, 'slash');
  const [menuBlockId, setMenuBlockId] = useSignal<string | null>(null, 'menuBlockId');

  const clearTimer = () => {
    if (commitTimer !== undefined) {
      clearTimeout(commitTimer);
      commitTimer = undefined;
    }
  };

  const clearDirty = () => {
    clearTimer();
    dirtyBlockId = null;
  };

  /** Patch the doc to match the rows RIGHT NOW (idempotent; effect also runs it). */
  const syncNow = () => {
    if (!editor) {
      return;
    }
    const tr = editor.state.tr;
    const applied = projectRowsIntoTransaction(tr, editor.state.schema, state.blocks, { dirtyBlockId });
    if (applied > 0) {
      editor.view.dispatch(tr);
    }
  };

  /** Commit one block's live text as ONE mutation; syncNow spares the CURRENT dirty block. */
  const commitText = (blockId: string, baseVersion: number) => {
    if (!editor) {
      return;
    }
    const node = findNode(editor.state.doc, blockId);
    if (!node) {
      return;
    }
    const row = state.rowOf(blockId);
    if (row && row.version !== baseVersion) {
      // D3's payoff today: the version marker detects that a peer committed
      // while we were typing. Last write (ours) wins; undo brings theirs back.
      setConflictNote('A peer edited this block while you were typing — your version won. Undo brings theirs back.');
      // wheel-view-timing: remove the transient conflict notice after the reader has time to see it
      setTimeout(() => setConflictNote(null), 5000);
    }
    state.commit(blockId, { text: textOfNode(node) }, baseVersion);
    syncNow();
    publishPresence(); // the block is no longer dirty — peers' preview evaporates
  };

  /** Commit the dirty block's text (pause, blur, undo, gesture). */
  const flush = () => {
    clearTimer();
    if (dirtyBlockId === null) {
      return;
    }
    const blockId = dirtyBlockId;
    dirtyBlockId = null;
    commitText(blockId, dirtyBaseVersion);
  };

  const markDirty = (blockId: string) => {
    if (dirtyBlockId !== blockId) {
      const previousId = dirtyBlockId;
      const previousBase = dirtyBaseVersion;
      // Adopt the NEW dirty block BEFORE committing the old one: the keystroke
      // that moved dirtiness here is already in the doc but not yet in the row,
      // and the commit's syncNow would otherwise project the stale row over it
      // — eating the first character typed after a block switch.
      dirtyBlockId = blockId;
      dirtyBaseVersion = state.rowOf(blockId)?.version ?? 0;
      if (previousId !== null) {
        commitText(previousId, previousBase);
      }
    }
    clearTimer();
    // wheel-view-timing: commit editor text after a short pause instead of on every keystroke
    commitTimer = setTimeout(flush, COMMIT_PAUSE_MS);
  };

  const cursorBlockId = (): string | null => {
    if (!editor) {
      return null;
    }
    const $from = editor.state.selection.$from;
    const node = $from.depth >= 1 ? $from.node(1) : null;
    return (node?.attrs.blockId as string | null) ?? null;
  };

  /**
   * Publish live editing state (008 P3): caret position in markdown-source
   * characters, plus the dirty block's uncommitted text as the peers'
   * display-only preview. Coalesced to ~120ms inside the service.
   */
  const publishPresence = () => {
    if (!editor) {
      return;
    }
    const { $head, $anchor } = editor.state.selection;
    if ($head.depth < 1) {
      return; // atom selection (divider) — nothing meaningful to point at
    }
    const node = $head.node(1);
    const blockId = (node.attrs.blockId as string | null) ?? null;
    if (!blockId) {
      return;
    }
    const caretOffset = sliceText(node, 0, $head.parentOffset).length;
    // The selection anchor rides along when it's in the SAME block (peers
    // render the range); cross-block selections publish the caret only.
    const sameBlock = $anchor.depth >= 1 && $anchor.node(1).attrs.blockId === blockId;
    const anchorOffset = sameBlock ? sliceText(node, 0, $anchor.parentOffset).length : caretOffset;
    const previewText = dirtyBlockId === blockId ? textOfNode(node) : null;
    state.publishCursor(blockId, caretOffset, anchorOffset, previewText);
  };

  // ---- gesture hooks (behavior.ts calls these; each one is one mutation) ----

  const hooks: GestureHooks = {
    split: (blockId, textBefore, newText, newKind) => {
      const base = dirtyBlockId === blockId ? dirtyBaseVersion : undefined;
      clearDirty();
      const newBlockId = state.split(blockId, textBefore, newText, newKind, base);
      syncNow();
      if (editor && newBlockId) {
        selectInBlock(editor.view, newBlockId, 0);
      }
    },
    merge: (intoBlockId, mergedText, removeBlockId) => {
      if (!editor) {
        return;
      }
      const target = findNode(editor.state.doc, intoBlockId);
      const joinOffset = target?.content.size ?? 0;
      clearDirty();
      state.merge(intoBlockId, mergedText, removeBlockId);
      syncNow();
      selectInBlock(editor.view, intoBlockId, joinOffset);
    },
    applyKind: (blockId, kind) => {
      if (!editor) {
        return;
      }
      clearDirty();
      const node = findNode(editor.state.doc, blockId);
      const text = node ? textOfNode(node) : undefined;
      state.setKind(blockId, kind, text);
      if (kind === 'divider') {
        // An atom can't hold the cursor — park it in a fresh paragraph after.
        const newBlockId = state.add(blockId);
        syncNow();
        selectInBlock(editor.view, newBlockId, 0);
      } else {
        syncNow();
        selectInBlock(editor.view, blockId, 0);
      }
    },
    setChecked: (blockId, checked) => {
      state.setChecked(blockId, checked);
      syncNow();
    },
    removeBlock: (blockId) => {
      if (dirtyBlockId === blockId) {
        clearDirty();
      }
      state.remove(blockId);
      syncNow();
    },
    handleKeyDown: (_view, event) => {
      const open = slash();
      if (!open) {
        return false;
      }
      const items = slashItems(open.query);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        setSlash({ ...open, index: (open.index + delta + items.length) % Math.max(items.length, 1) });
        return true;
      }
      if (event.key === 'Escape') {
        setSlash(null);
        return true;
      }
      return false;
    },
    // Enter arrives through the gesture keymap, which outruns handleKeyDown
    // (tiptap orders keymaps before plugins) — so the slash menu's Enter is
    // its own hook.
    interceptEnter: () => {
      const open = slash();
      if (!open) {
        return false;
      }
      const item = slashItems(open.query)[open.index];
      if (item) {
        chooseSlashItem(open, item.kind);
      }
      return true;
    }
  };

  // ---- slash menu ----

  const slashItems = (query: string) =>
    SLASH_ITEMS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));

  /** After any local change: is the cursor block showing a `/query`? */
  const detectSlash = () => {
    if (!editor) {
      return;
    }
    const $from = editor.state.selection.$from;
    const node = $from.depth >= 1 ? $from.node(1) : null;
    const blockId = (node?.attrs.blockId as string | null) ?? null;
    if (!node || !blockId || node.type.name === 'codeBlock') {
      setSlash(null);
      return;
    }
    const text = node.textContent;
    const match = /^\/([a-z0-9]*)$/i.exec(text);
    const atEnd = $from.parentOffset === node.content.size;
    if (!match || !atEnd) {
      setSlash(null);
      return;
    }
    const coords = editor.view.coordsAtPos(editor.state.selection.from);
    const box = wrapper.getBoundingClientRect();
    const previous = slash();
    setSlash({
      blockId,
      query: match[1],
      index: previous?.blockId === blockId ? Math.min(previous.index, Math.max(slashItems(match[1]).length - 1, 0)) : 0,
      x: coords.left - box.left,
      y: coords.bottom - box.top + 4
    });
  };

  const chooseSlashItem = (open: SlashState, kind: Kind) => {
    setSlash(null);
    if (!editor) {
      return;
    }
    // Remove the "/query" text, then run the ordinary kind-change flow.
    const block = positionedBlocks(editor.state.doc).find((candidate) => candidate.id === open.blockId);
    if (block) {
      editor.view.dispatch(editor.state.tr.delete(block.pos + 1, block.pos + 1 + block.node.content.size));
    }
    hooks.applyKind(open.blockId, kind);
    editor.view.focus();
  };

  // ---- editor lifecycle ----

  const mountEditor = (rows: readonly Block[]) => {
    editor = new Editor({
      element: container,
      extensions: [...schemaExtensions(), gestureExtension(hooks), PresenceExtension],
      content: docJsonFromRows(rows),
      editorProps: {
        // Paste lands as plain text INSIDE the cursor block — cross-block
        // paste (blocks as rows, id restamping) is future work.
        handlePaste: (pmView, event) => {
          const text = event.clipboardData?.getData('text/plain');
          if (!text) {
            return true;
          }
          const inCode = pmView.state.selection.$from.node(1)?.type.name === 'codeBlock';
          const insert = inCode ? text : text.replace(/\s*\n+\s*/g, ' ');
          const { from, to } = pmView.state.selection;
          pmView.dispatch(pmView.state.tr.insertText(insert, from, to));
          return true;
        },
        handleDrop: () => true // block-level drag/drop stays with move up/down for now
      },
      onTransaction: ({ transaction }) => {
        if (transaction.docChanged && !transaction.getMeta(REMOTE_META)) {
          const blockId = cursorBlockId();
          if (blockId) {
            markDirty(blockId);
            publishPresence(); // caret + live preview, coalesced downstream
          }
          // Only LOCAL doc changes re-evaluate the slash menu. Running this on
          // every transaction re-opened an Escape-closed menu the moment any
          // unrelated dispatch (a presence update) arrived while the block
          // still read "/query".
          detectSlash();
        }
      },
      onSelectionUpdate: () => {
        // Leaving the dirty block commits it (the "blur" half of pause+blur).
        if (dirtyBlockId !== null && cursorBlockId() !== dirtyBlockId) {
          flush();
        }
        detectSlash(); // caret moved off the query (or into one): re-evaluate
        publishPresence();
      },
      onFocus: () => publishPresence(),
      onBlur: () => {
        flush();
        state.publishCursor(null); // immediate — peers never see a stale caret
      }
    });
  };

  // imperative boundary: rows → tiptap doc. Tracks blocks(); mounts the
  // editor on first data, tears it down if the document empties, patches
  // minimally otherwise.
  createEffect(() => {
    const rows = state.blocks;
    if (rows.length === 0) {
      if (editor) {
        clearDirty();
        editor.destroy();
        editor = null;
      }
      return;
    }
    if (!editor) {
      mountEditor(rows);
      return;
    }
    syncNow();
  });

  let hadPeers = false;
  // imperative boundary: presence map → ProseMirror decorations. The
  // viewer's own dirty block keeps its DOTS but drops peer carets/previews —
  // their typing wins the display there (the dirty-block rule, again).
  createEffect(() => {
    const raw = state.peersByBlock;
    if (!editor) {
      return;
    }
    // A lone client recomputes an empty map on EVERY client notify; skip the
    // empty→empty dispatch instead of churning the editor view each time.
    if (raw.size === 0 && !hadPeers) {
      return;
    }
    hadPeers = raw.size > 0;
    const map = new Map<string, readonly BlockPeer[]>();
    for (const [blockId, peers] of raw) {
      map.set(
        blockId,
        blockId === dirtyBlockId
          ? peers.map((peer) => ({ ...peer, caretOffset: null, previewText: null }))
          : peers
      );
    }
    updatePresence(editor.view, map);
  });

  // D1: undo flushes uncommitted typing first, through this hook.
  const unregister = state.registerFlushHook(flush);

  onCleanup(() => {
    unregister();
    flush();
    editor?.destroy();
    editor = null;
  });

  // Right-click: resolve the clicked block BEFORE the context-menu directive
  // opens (capture phase on the wrapper fires first), and flush so menu
  // actions see committed text.
  const onContextMenuCapture = (event: MouseEvent) => {
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-block-id]') : null;
    const blockId = target?.getAttribute('data-block-id') ?? null;
    if (!blockId) {
      event.stopPropagation(); // no block under the pointer — no menu
      return;
    }
    flush();
    setMenuBlockId(blockId);
  };

  return (
    <div
      use:componentRoot
      ref={wrapper}
      class={styles.wrapper}
      use:contextMenu={{
        id: 'editor:block',
        menu: () => (
          <Show when={menuBlockId()} keyed>
            {(blockId) => <BlockContextMenu blockId={blockId} />}
          </Show>
        )
      }}
    >
      <Show when={state.status.kind === 'loading' && state.blocks.length === 0}>
        <span class="stale-note">loading… (first boot with no cache and no server waits here)</span>
      </Show>
      <div
        ref={(element) => {
          container = element;
          element.addEventListener('contextmenu', onContextMenuCapture, true);
        }}
        class={styles.editor}
      />
      <Show when={state.status.kind !== 'loading' && state.blocks.length === 0}>
        <Button class={styles.addButton} onClick={() => state.add()}>
          + add the first block
        </Button>
      </Show>
      <Show when={conflictNote()}>{(note) => <div class={styles.conflictNote}>{note()}</div>}</Show>
      <Show when={slash()} keyed>
        {(open) => (
          <div class={styles.slashMenu} style={{ left: `${open.x}px`, top: `${open.y}px` }}>
            <For each={slashItems(open.query)}>
              {(item, index) => (
                <Button
                  class={styles.slashItem}
                  classList={{ [styles.slashActive]: index() === open.index }}
                  onMouseDown={(event) => {
                    event.preventDefault(); // keep editor focus
                    chooseSlashItem(open, item.kind);
                  }}
                >
                  {item.label}
                </Button>
              )}
            </For>
            <Show when={slashItems(open.query).length === 0}>
              <span class={styles.slashEmpty}>no match</span>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
