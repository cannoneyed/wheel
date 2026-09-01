/**
 * The Wheel → Chalk editor half of the projection (design.md):
 *
 *   wheel rows ──(diff rows vs doc BY BLOCK ID, patch minimally)──▶ tiptap doc
 *
 * Whenever rows change (remote delta, optimistic apply, undo rebase) the doc
 * is patched with the smallest transaction that makes it match — replace one
 * changed block, insert/delete/move nodes — NEVER rebuilt wholesale, or the
 * cursor and any in-progress typing would be destroyed.
 *
 * The dirty-block rule lives here too: while the local user has uncommitted
 * typing in block X, incoming changes to X (edits AND deletion) are held
 * back — the doc wins for X, rows win for everything else. On commit the
 * block converges last-write-wins.
 *
 * Everything operates on the ProseMirror model, no DOM — so it's all
 * testable in plain node.
 */
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { TextSelection, type Transaction } from '@tiptap/pm/state';

import type { Block } from '../sync/editor.sync';
import { parseInline, serializeInline, type InlineNode } from './markdown';
import { kindForNode, nodeNameForKind } from './schema';

/** Marks a projection transaction so change listeners don't commit it back. */
export const REMOTE_META = 'wheelProjection';

interface PositionedBlock {
  id: string;
  node: ProseMirrorNode;
  pos: number;
}

/** Top-level nodes with their doc positions, keyed by blockId attr. */
export function positionedBlocks(doc: ProseMirrorNode): PositionedBlock[] {
  const blocks: PositionedBlock[] = [];
  doc.forEach((node, offset) => {
    blocks.push({ id: (node.attrs.blockId as string | null) ?? `#${offset}`, node, pos: offset });
  });
  return blocks;
}

/** A block row rendered as a ProseMirror node (markdown text → inline nodes). */
export function nodeFromBlock(schema: Schema, block: Block): ProseMirrorNode {
  return schema.nodeFromJSON(blockNodeJson(block));
}

function blockNodeJson(block: Block): Record<string, unknown> {
  const name = nodeNameForKind(block.kind);
  const attrs: Record<string, unknown> = { blockId: block.id };
  if (name === 'heading') {
    attrs.level = block.kind === 'h2' ? 2 : block.kind === 'h3' ? 3 : 1;
  }
  if (name === 'todo') {
    attrs.checked = block.checked ?? false;
  }
  if (name === 'codeBlock') {
    attrs.language = block.language;
  }
  if (name === 'divider') {
    return { type: name, attrs };
  }
  // Code blocks hold literal text; everything else parses inline markdown.
  const content: InlineNode[] =
    name === 'codeBlock'
      ? block.text
        ? [{ type: 'text', text: block.text }]
        : []
      : parseInline(block.text);
  return content.length ? { type: name, attrs, content } : { type: name, attrs };
}

/** A node's content serialized back to the row's `text` representation. */
export function textOfNode(node: ProseMirrorNode): string {
  if (node.type.name === 'divider') {
    return '';
  }
  if (node.type.name === 'codeBlock') {
    return node.textContent;
  }
  const inline = (node.toJSON() as { content?: InlineNode[] }).content ?? [];
  return serializeInline(inline);
}

/** The row a node would commit as (kind + text + kind-specific fields). */
export function blockFieldsOfNode(node: ProseMirrorNode): {
  kind: Block['kind'];
  text: string;
  checked: boolean | null;
  language: string | null;
} {
  const kind = kindForNode(node.type.name, node.attrs);
  return {
    kind,
    text: textOfNode(node),
    checked: kind === 'todo' ? Boolean(node.attrs.checked) : null,
    language: kind === 'code' ? ((node.attrs.language as string | null) ?? null) : null
  };
}

/** The whole document as PM doc JSON — the editor's initial content. */
export function docJsonFromRows(rows: readonly Block[]): Record<string, unknown> {
  return { type: 'doc', content: rows.map((row) => blockNodeJson(row)) };
}

/**
 * Stable deep-compare via key-sorted JSON. Mark arrays sort by type too:
 * ProseMirror orders a text node's marks by schema rank, the markdown codec
 * by nesting depth — same marks, different order, and a naive compare would
 * phantom-replace an unchanged block on every projection pass (destroying
 * the cursor).
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) => {
    if (key === 'marks' && Array.isArray(item)) {
      return [...(item as Array<{ type: string }>)].sort((a, b) => (a.type < b.type ? -1 : 1));
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)));
    }
    return item;
  });
}

export interface ProjectionOptions {
  /** The block with uncommitted local typing — held back from all patching. */
  dirtyBlockId?: string | null;
}

/**
 * Mutate `tr` so the doc matches `rows` (ordered). Returns the number of
 * steps applied — 0 means the doc already matched (the echo of our own
 * commit, the common case).
 */
export function projectRowsIntoTransaction(
  tr: Transaction,
  schema: Schema,
  rows: readonly Block[],
  options: ProjectionOptions = {}
): number {
  const dirty = options.dirtyBlockId ?? null;
  const rowById = new Map(rows.map((row) => [row.id, row]));
  let applied = 0;

  // Remember where the cursor is BEFORE patching: if its block gets
  // replaced (undo/redo restoring text, a peer rewriting the block the
  // cursor is parked in), PM's mapping dumps the cursor at the replacement
  // boundary — "weird/random places." We re-place it deliberately below.
  const $head = tr.selection.$head;
  const cursorHome =
    $head.depth >= 1
      ? {
          blockId: ($head.node(1).attrs.blockId as string | null) ?? null,
          offset: $head.parentOffset,
          oldText: $head.node(1).textContent
        }
      : null;
  let cursorBlockReplaced = false;

  // 1. Replacements and deletions, bottom-up so positions stay valid.
  const existing = positionedBlocks(tr.doc);
  for (const block of [...existing].sort((a, b) => b.pos - a.pos)) {
    if (block.id === dirty) {
      continue; // the dirty-block rule: never touch in-progress typing
    }
    const row = rowById.get(block.id);
    if (!row) {
      tr.delete(tr.mapping.map(block.pos), tr.mapping.map(block.pos + block.node.nodeSize));
      applied += 1;
      continue;
    }
    const expected = blockNodeJson(row);
    if (canonical(block.node.toJSON()) !== canonical(expected)) {
      tr.replaceWith(
        tr.mapping.map(block.pos),
        tr.mapping.map(block.pos + block.node.nodeSize),
        schema.nodeFromJSON(expected)
      );
      applied += 1;
      if (cursorHome && block.id === cursorHome.blockId) {
        cursorBlockReplaced = true;
      }
    }
  }

  // 2. Insertions: place each new row after its nearest preceding row that
  // already has a node (rows arrive in document order).
  const present = new Set(positionedBlocks(tr.doc).map((block) => block.id));
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (present.has(row.id)) {
      continue;
    }
    const current = positionedBlocks(tr.doc);
    const byId = new Map(current.map((block) => [block.id, block]));
    let insertPos = 0;
    for (let before = index - 1; before >= 0; before -= 1) {
      const anchor = byId.get(rows[before].id);
      if (anchor) {
        insertPos = anchor.pos + anchor.node.nodeSize;
        break;
      }
    }
    tr.insert(insertPos, nodeFromBlock(schema, row));
    present.add(row.id);
    applied += 1;
  }

  // 3. Reorder: bubble each out-of-place node to its target index. O(n²)
  // rescans, but moves are rare and documents are small.
  const targetOrder = rows.map((row) => row.id).filter((id) => present.has(id));
  // A held-back node (dirty but remotely deleted) has no row — keep it where
  // it currently sits instead of shuffling the others around it.
  for (const [index, block] of positionedBlocks(tr.doc).entries()) {
    if (!targetOrder.includes(block.id)) {
      targetOrder.splice(Math.min(index, targetOrder.length), 0, block.id);
    }
  }
  for (let index = 0; index < targetOrder.length; index += 1) {
    const current = positionedBlocks(tr.doc);
    if (current[index]?.id === targetOrder[index]) {
      continue;
    }
    const moving = current.find((block) => block.id === targetOrder[index]);
    if (!moving) {
      continue; // deleted-but-dirty: held back, skip
    }
    const node = moving.node;
    tr.delete(moving.pos, moving.pos + node.nodeSize);
    const after = positionedBlocks(tr.doc);
    const insertPos = index < after.length ? after[index].pos : tr.doc.content.size;
    tr.insert(insertPos, node);
    applied += 1;
  }

  // Re-place the cursor inside its replaced block: at the same offset when
  // the text didn't change (a kind change), otherwise at the point where old
  // and new text diverge — which is where the undone/redone edit happened.
  // (Plain-text offsets ARE inline PM offsets here: every inline child is
  // text, and marks don't occupy positions.)
  if (cursorHome?.blockId && cursorBlockReplaced) {
    const landed = positionedBlocks(tr.doc).find((block) => block.id === cursorHome.blockId);
    if (landed && !landed.node.isAtom) {
      const newText = landed.node.textContent;
      const offset =
        newText === cursorHome.oldText ? cursorHome.offset : divergenceOffset(cursorHome.oldText, newText);
      tr.setSelection(TextSelection.create(tr.doc, landed.pos + 1 + Math.min(offset, landed.node.content.size)));
    }
  }

  if (applied > 0) {
    tr.setMeta(REMOTE_META, true);
    tr.setMeta('addToHistory', false);
  }
  return applied;
}

/**
 * Where an edit "happened", seen from the new text: the end of the changed
 * region. Undoing typed text lands where the typing began; redoing it lands
 * after the re-inserted text.
 */
function divergenceOffset(oldText: string, newText: string): number {
  let prefix = 0;
  const max = Math.min(oldText.length, newText.length);
  while (prefix < max && oldText[prefix] === newText[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (suffix < max - prefix && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]) {
    suffix += 1;
  }
  return newText.length - suffix;
}
