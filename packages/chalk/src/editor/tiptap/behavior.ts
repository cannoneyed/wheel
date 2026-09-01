/**
 * The Chalk editor → Wheel half of the projection (design.md):
 *
 *   tiptap gestures ──(interpret: split? merge? kind change?)──▶ wheel mutations
 *
 * Structural gestures are intercepted BEFORE they touch the doc and routed
 * to the hooks (which call EditorService); the resulting row change then
 * projects back into the doc (projection.ts). Plain typing is NOT here — it
 * flows through tiptap normally and commits on pause/blur.
 *
 * The payloads (`textBefore`, `mergedText`, …) are serialized from the LIVE
 * doc, so uncommitted typing rides along inside the gesture's own mutation —
 * one gesture, one mutation, one undo step, nothing lost.
 */
import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import type { Kind } from '../sync/editor.sync';
import { serializeInline, type InlineNode } from './markdown';
import { kindForNode } from './schema';

export interface GestureHooks {
  /** Enter mid-block: this block keeps `textBefore`, a new `newKind` block with `newText` lands after. */
  split(blockId: string, textBefore: string, newText: string, newKind: Kind): void;
  /** Backspace at block start: `intoBlockId` absorbs the text, `removeBlockId` goes away. */
  merge(intoBlockId: string, mergedText: string, removeBlockId: string): void;
  /** Markdown input rule fired (`# `, `- `, `> `, …): turn the block into `kind`. */
  applyKind(blockId: string, kind: Kind): void;
  /** Todo checkbox clicked. */
  setChecked(blockId: string, checked: boolean): void;
  /** A selected divider was deleted. */
  removeBlock(blockId: string): void;
  /** First responder for keydown — the slash menu consumes its keys here. */
  handleKeyDown?(view: EditorView, event: KeyboardEvent): boolean;
  /**
   * First responder for the Enter KEYMAP binding specifically. tiptap places
   * every extension's keymap BEFORE its ProseMirror plugins, so the Enter
   * binding below would beat `handleKeyDown` to the key — an open slash menu
   * would split the query block instead of applying the highlighted item.
   * Return true to consume Enter before the split/append gesture runs.
   */
  interceptEnter?(): boolean;
}

/** `# `-style prefixes → kind. Checked in order; fired when a space completes one. */
const KIND_PREFIXES: ReadonlyArray<{ prefix: string; kind: Kind }> = [
  { prefix: '###', kind: 'h3' },
  { prefix: '##', kind: 'h2' },
  { prefix: '#', kind: 'h1' },
  { prefix: '-', kind: 'bullet' },
  { prefix: '*', kind: 'bullet' },
  { prefix: '1.', kind: 'number' },
  { prefix: '[]', kind: 'todo' },
  { prefix: '[ ]', kind: 'todo' },
  { prefix: '>', kind: 'quote' },
  { prefix: '```', kind: 'code' },
  { prefix: '---', kind: 'divider' }
];

/** The cursor's top-level block, or null when the selection spans blocks. */
function cursorBlock(state: EditorState): { node: ProseMirrorNode; pos: number; $from: ResolvedPos } | null {
  const { $from, $to } = state.selection;
  if ($from.depth === 0) {
    return null; // NodeSelection on an atom (divider) resolves at depth 0
  }
  const pos = $from.before(1);
  if ($to.before(1) !== pos) {
    return null;
  }
  return { node: $from.node(1), pos, $from };
}

/** Inline content of `node` between two content offsets, as markdown. */
export function sliceText(node: ProseMirrorNode, from: number, to: number): string {
  if (node.type.name === 'codeBlock') {
    return node.textBetween(from, to);
  }
  const fragment = node.content.cut(from, to);
  return serializeInline((fragment.toJSON() ?? []) as InlineNode[]);
}

/** What Enter creates after each kind: lists continue, prose resets. */
function continuationKind(kind: Kind): Kind {
  return kind === 'bullet' || kind === 'number' || kind === 'todo' ? kind : 'paragraph';
}

function blockIdOf(node: ProseMirrorNode): string | null {
  return (node.attrs.blockId as string | null) ?? null;
}

/**
 * Re-read the DOM selection into ProseMirror state before a gesture key is
 * interpreted. Native caret movement (arrow keys) reaches PM state through an
 * async `selectionchange` flush; a gesture key pressed inside that window
 * would otherwise be read against the caret's PREVIOUS position — Backspace
 * at "offset 0" seen as mid-text (no demote, no merge), Enter splitting at
 * the wrong offset. NodeSelections (a clicked divider) are always set
 * programmatically, never stale, and their DOM selection is PM-managed — so
 * only text selections are re-read.
 */
function syncSelectionFromDom(view: EditorView): void {
  if (!view.hasFocus() || !(view.state.selection instanceof TextSelection)) {
    return;
  }
  // The demos render into the document (no shadow root), so root is a Document.
  const domSel = (view.root as Document).getSelection();
  const { anchorNode, anchorOffset, focusNode, focusOffset } = domSel ?? {};
  if (!anchorNode || !focusNode || !view.dom.contains(anchorNode) || !view.dom.contains(focusNode)) {
    return;
  }
  let anchor: number;
  let head: number;
  try {
    anchor = view.posAtDOM(anchorNode, anchorOffset ?? 0);
    head = view.posAtDOM(focusNode, focusOffset ?? 0);
  } catch {
    return; // unmappable DOM position (mid-mutation) — keep the current state
  }
  if (anchor < 0 || head < 0) {
    return;
  }
  const selection = TextSelection.between(view.state.doc.resolve(anchor), view.state.doc.resolve(head));
  if (!selection.eq(view.state.selection)) {
    view.dispatch(view.state.tr.setSelection(selection));
  }
}

/** Build the gesture extension around the feature's hooks. */
export function gestureExtension(hooks: GestureHooks): Extension {
  return Extension.create({
    name: 'wheelGestures',

    addKeyboardShortcuts() {
      // Every binding here interprets the selection, so each one re-syncs it
      // from the DOM first (see syncSelectionFromDom) — including the mark
      // toggles, whose shift+arrow selections are just as natively made.
      return {
        Enter: () => {
          if (hooks.interceptEnter?.() ?? false) {
            return true;
          }
          syncSelectionFromDom(this.editor.view);
          return handleEnter(this.editor.view.state, this.editor.view, hooks);
        },
        Backspace: () => {
          syncSelectionFromDom(this.editor.view);
          return handleBackspace(this.editor.view.state, hooks);
        },
        // Marks are ordinary local edits — they ride the text-commit path.
        'Mod-b': () => {
          syncSelectionFromDom(this.editor.view);
          return this.editor.commands.toggleMark('bold');
        },
        'Mod-i': () => {
          syncSelectionFromDom(this.editor.view);
          return this.editor.commands.toggleMark('italic');
        },
        'Mod-e': () => {
          syncSelectionFromDom(this.editor.view);
          return this.editor.commands.toggleMark('code');
        },
        'Mod-Shift-x': () => {
          syncSelectionFromDom(this.editor.view);
          return this.editor.commands.toggleMark('strike');
        }
      };
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('wheelGesturePlugin'),
          props: {
            // The slash menu gets first look at every key EXCEPT ones bound in
            // addKeyboardShortcuts above (tiptap orders keymaps before
            // plugins) — those consult `interceptEnter` instead.
            handleKeyDown: (view, event) => hooks.handleKeyDown?.(view, event) ?? false,
            // Todo checkboxes are chrome (contenteditable=false) — clicks
            // arrive here, not as doc changes.
            handleClick: (view, pos, event) => {
              const target = event.target instanceof HTMLElement ? event.target.closest('.todo-checkbox') : null;
              if (!target) {
                return false;
              }
              const $pos = view.state.doc.resolve(pos);
              const node = $pos.depth >= 1 ? $pos.node(1) : view.state.doc.nodeAt(pos);
              const blockId = node ? blockIdOf(node) : null;
              if (node && node.type.name === 'todo' && blockId) {
                hooks.setChecked(blockId, !(node.attrs.checked as boolean));
                return true;
              }
              return false;
            },
            // Markdown prefixes complete on space: "# ", "- ", "> ", "1. ".
            handleTextInput: (view, from, _to, text) => {
              if (text !== ' ') {
                return false;
              }
              return handleKindPrefix(view, from, hooks);
            }
          }
        })
      ];
    }
  });
}

function handleEnter(state: EditorState, view: EditorView, hooks: GestureHooks): boolean {
  // A selected divider: Enter means "give me a paragraph after it" — modeled
  // as a split carrying no text.
  const selectedNode = 'node' in state.selection ? (state.selection as { node: ProseMirrorNode }).node : null;
  if (selectedNode?.type.name === 'divider') {
    const blockId = blockIdOf(selectedNode);
    if (blockId) {
      hooks.split(blockId, '', '', 'paragraph');
    }
    return true;
  }
  const block = cursorBlock(state);
  if (!block) {
    return true; // cross-block selections: swallow rather than guess
  }
  const blockId = blockIdOf(block.node);
  if (!blockId) {
    return true;
  }
  // Code blocks: Enter is a literal newline; Enter on a trailing blank line
  // drops the blank line and exits to a fresh paragraph.
  if (block.node.type.name === 'codeBlock') {
    const { from, to } = state.selection;
    const atEnd = to === block.pos + block.node.nodeSize - 1;
    if (atEnd && block.node.textContent.endsWith('\n')) {
      hooks.split(blockId, block.node.textContent.replace(/\n$/, ''), '', 'paragraph');
    } else {
      view.dispatch(state.tr.insertText('\n', from, to));
    }
    return true;
  }
  const kind = kindForNode(block.node.type.name, block.node.attrs);
  const offset = block.$from.parentOffset;
  const endOffset = state.selection.$to.parentOffset;
  const textBefore = sliceText(block.node, 0, offset);
  const textAfter = sliceText(block.node, endOffset, block.node.content.size);
  // Enter on an EMPTY list/quote item: escape to a paragraph instead of
  // stacking empties (the Notion/Linear convention).
  if (kind !== 'paragraph' && block.node.content.size === 0) {
    hooks.applyKind(blockId, 'paragraph');
    return true;
  }
  hooks.split(blockId, textBefore, textAfter, continuationKind(kind));
  return true;
}

function handleBackspace(state: EditorState, hooks: GestureHooks): boolean {
  // A selected divider deletes like any block.
  const selectedNode = 'node' in state.selection ? (state.selection as { node: ProseMirrorNode }).node : null;
  if (selectedNode?.type.name === 'divider') {
    const blockId = blockIdOf(selectedNode);
    if (blockId) {
      hooks.removeBlock(blockId);
      return true;
    }
  }
  const block = cursorBlock(state);
  if (!block || !state.selection.empty || block.$from.parentOffset !== 0) {
    return false; // not at block start — ordinary character deletion
  }
  const blockId = blockIdOf(block.node);
  if (!blockId) {
    return false;
  }
  const kind = kindForNode(block.node.type.name, block.node.attrs);
  // Backspace at the start of a styled block: demote to paragraph first.
  if (kind !== 'paragraph') {
    hooks.applyKind(blockId, 'paragraph');
    return true;
  }
  const index = state.doc.resolve(block.pos).index(0);
  if (index === 0) {
    return true; // first block: nowhere to merge
  }
  const previous = state.doc.child(index - 1);
  const previousId = blockIdOf(previous);
  if (!previousId) {
    return true;
  }
  // Backspacing into a divider removes the divider (you can't merge into it).
  if (previous.type.name === 'divider') {
    hooks.removeBlock(previousId);
    return true;
  }
  const mergedText = sliceText(previous, 0, previous.content.size) + sliceText(block.node, 0, block.node.content.size);
  hooks.merge(previousId, mergedText, blockId);
  return true;
}

function handleKindPrefix(view: EditorView, from: number, hooks: GestureHooks): boolean {
  const state = view.state;
  const block = cursorBlock(state);
  if (!block || block.node.type.name === 'codeBlock') {
    return false;
  }
  const blockId = blockIdOf(block.node);
  if (!blockId) {
    return false;
  }
  const beforeCursor = block.node.textBetween(0, from - block.pos - 1);
  const match = KIND_PREFIXES.find((candidate) => candidate.prefix === beforeCursor);
  const kind = kindForNode(block.node.type.name, block.node.attrs);
  if (!match || match.kind === kind) {
    return false;
  }
  // Delete the typed prefix from the doc FIRST, so applyKind (which
  // serializes the live doc into the kind-change commit) never sees it.
  view.dispatch(state.tr.delete(block.pos + 1, from));
  hooks.applyKind(blockId, match.kind);
  return true; // the triggering space is swallowed too
}

/** Place the cursor at a content offset inside the block with `blockId`. */
export function selectInBlock(view: EditorView, blockId: string, offset: number): void {
  view.state.doc.forEach((node, pos) => {
    if (node.attrs.blockId === blockId) {
      const base = pos + 1;
      const clamped = Math.min(offset, node.content.size);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, base + clamped)));
    }
  });
}
