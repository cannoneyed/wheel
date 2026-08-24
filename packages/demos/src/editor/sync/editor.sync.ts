/**
 * Editor sync module — the block-document contract (007 design):
 *
 * - A block row = one top-level node in the single tiptap editor: `kind`
 *   (paragraph/heading/bullet/…), `text` (INLINE markdown only — bold,
 *   italic, code, links; the kind is a column, never a `#` prefix in text),
 *   plus kind-specific fields (`checked` for todos, `language` for code).
 * - `version` counts edits per block. Every edit carries the `baseVersion`
 *   it was based on — informational today (powers the "peer edited this
 *   while you were typing" warning), and the door OT ops would later walk
 *   through (D3): same marker, different payload.
 * - Split and merge are ORDINARY single mutations that each write two rows
 *   (D2) and invert into each other with explicit payloads, so one gesture
 *   is one undo step with byte-exact restores.
 * - Undo model: every mutation declares `invert`; ids for created rows are
 *   ARGS-BORNE (minted via client.newId) so inverts can name them.
 */
import { mutation, orphan, positionBetween, presence, query, t, table, type Infer, type InverseSpec } from 'wheel/sync';

/** The block kinds the editor renders (D5 — deliberately simple). */
export const BlockKind = t.enum([
  'paragraph',
  'h1',
  'h2',
  'h3',
  'bullet',
  'number',
  'todo',
  'quote',
  'code',
  'divider'
]);

/** One block row. `text` is inline markdown; block-level structure lives in `kind`. */
export const BlockRow = t.object({
  id: t.string(),
  kind: BlockKind,
  text: t.string(),
  checked: t.boolean().nullable(),
  language: t.string().nullable(),
  position: t.number(),
  version: t.number()
});

type Block = Infer<typeof BlockRow>;
export type { Block };
export type Kind = Infer<typeof BlockKind>;

export const blocks = table({ name: 'blocks', type: BlockRow, key: (row) => row.id });

/**
 * Ephemeral per-client editing state (008 P2/P3): which block, caret +
 * selection anchor inside it (offsets in markdown-source characters —
 * `anchorOffset` equals `caretOffset` when nothing is selected), and —
 * while typing is uncommitted — the live preview text peers render
 * display-only. Relayed via the presence channel: no rows, no history,
 * dies with the connection.
 */
export const editorPresence = presence({
  name: 'editor',
  state: t.object({
    blockId: t.string().nullable(),
    caretOffset: t.number().nullable(),
    anchorOffset: t.number().nullable(),
    previewText: t.string().nullable()
  })
});

/** The whole document: every block, in fractional-position order. */
export const blockList = query({
  name: 'blocks.all',
  params: t.object({}),
  into: blocks,
  projection: {
    filter: () => true,
    // Tie-break by id so both sides order deterministically even on equal positions.
    sort: (a, b) => a.position - b.position || (a.id < b.id ? -1 : 1)
  }
});

/** Where a new block lands (mirrors the neighbor SELECTs in editor.server.ts). */
function insertPosition(rows: readonly Block[], afterBlockId: string | undefined): number {
  const after = afterBlockId === undefined ? undefined : rows.find((row) => row.id === afterBlockId);
  if (after) {
    let next: Block | undefined;
    for (const row of rows) {
      if (row.position > after.position && (next === undefined || row.position < next.position)) {
        next = row;
      }
    }
    return positionBetween(after.position, next?.position);
  }
  let last: Block | undefined;
  for (const row of rows) {
    if (last === undefined || row.position > last.position) {
      last = row;
    }
  }
  return positionBetween(last?.position, undefined);
}

/** Field defaults for newly created blocks. */
const FRESH = { checked: null, language: null, version: 1 } as const;

/**
 * Insert a block. The optional text/kind/… fields are the RESTORE path:
 * deleteBlock's inverse re-creates the old row byte-exactly.
 * Inverse: delete it.
 */
export const addBlock = mutation({
  name: 'blocks.add',
  args: t.object({
    blockId: t.string(),
    afterBlockId: t.string().optional(),
    kind: BlockKind.optional(),
    text: t.string().optional(),
    checked: t.boolean().nullable().optional(),
    language: t.string().nullable().optional(),
    position: t.number().optional(),
    version: t.number().optional()
  }),
  optimistic: (cache, args) => {
    const position = args.position ?? insertPosition(cache.list(blocks), args.afterBlockId);
    cache.put(blocks, {
      id: args.blockId,
      kind: args.kind ?? 'paragraph',
      text: args.text ?? '',
      checked: args.checked ?? FRESH.checked,
      language: args.language ?? FRESH.language,
      position,
      version: args.version ?? FRESH.version
    });
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: deleteBlock,
    args: { blockId: args.blockId },
    description: 'add block'
  })
});

/**
 * Patch a block (text on flush, kind via input rules / slash menu, checked
 * on todo toggle, language on code blocks). Bumps `version`; carries the
 * `baseVersion` the edit was based on (D3 — see module doc).
 * Inverse: patch the prior values back.
 */
export const editBlock = mutation({
  name: 'blocks.edit',
  args: t.object({
    blockId: t.string(),
    baseVersion: t.number(),
    patch: t.object({
      text: t.string().optional(),
      kind: BlockKind.optional(),
      checked: t.boolean().nullable().optional(),
      language: t.string().nullable().optional()
    })
  }),
  optimistic: (cache, args) => {
    const row = cache.get(blocks, args.blockId);
    if (row) {
      cache.update(blocks, args.blockId, { ...args.patch, version: row.version + 1 });
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(blocks, args.blockId);
    if (!row) {
      return null;
    }
    const prior: Record<string, unknown> = {};
    for (const field of Object.keys(args.patch)) {
      prior[field] = (row as Record<string, unknown>)[field];
    }
    return {
      mutation: editBlock,
      args: { blockId: args.blockId, baseVersion: row.version, patch: prior },
      description: 'edit block'
    };
  }
});

/**
 * Enter mid-block: ONE gesture, ONE mutation, TWO row writes (D2) — the
 * original keeps `textBefore`, a new block lands right after with `newText`.
 * All payloads explicit so the inverse (a merge) restores byte-exactly.
 */
export const splitBlock = mutation({
  name: 'blocks.split',
  args: t.object({
    blockId: t.string(),
    baseVersion: t.number(),
    textBefore: t.string(),
    newBlockId: t.string(),
    newKind: BlockKind,
    newText: t.string(),
    newChecked: t.boolean().nullable().optional(),
    newLanguage: t.string().nullable().optional(),
    newPosition: t.number().optional(),
    newVersion: t.number().optional()
  }),
  optimistic: (cache, args) => {
    const row = cache.get(blocks, args.blockId);
    if (!row) {
      throw orphan(`block ${args.blockId} is gone`);
    }
    cache.update(blocks, args.blockId, { text: args.textBefore, version: row.version + 1 });
    cache.put(blocks, {
      id: args.newBlockId,
      kind: args.newKind,
      text: args.newText,
      checked: args.newChecked ?? FRESH.checked,
      language: args.newLanguage ?? FRESH.language,
      position: args.newPosition ?? insertPosition(cache.list(blocks), args.blockId),
      version: args.newVersion ?? FRESH.version
    });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(blocks, args.blockId);
    if (!row) {
      return null;
    }
    return {
      mutation: mergeBlock,
      args: { blockId: args.blockId, baseVersion: row.version, mergedText: row.text, removeBlockId: args.newBlockId },
      description: 'split block'
    };
  }
});

/**
 * Backspace at block start: the previous block absorbs this one — ONE
 * gesture, ONE mutation, TWO row writes. `mergedText` is explicit (the
 * editor knows the join). Inverse: the matching split, restoring the removed
 * row byte-exactly (id, kind, position, version and all).
 */
export const mergeBlock = mutation({
  name: 'blocks.merge',
  args: t.object({
    blockId: t.string(),
    baseVersion: t.number(),
    mergedText: t.string(),
    removeBlockId: t.string()
  }),
  optimistic: (cache, args) => {
    const into = cache.get(blocks, args.blockId);
    const removed = cache.get(blocks, args.removeBlockId);
    if (!into || !removed) {
      throw orphan(`merge blocks are gone (${args.blockId} ← ${args.removeBlockId})`);
    }
    cache.update(blocks, args.blockId, { text: args.mergedText, version: into.version + 1 });
    cache.delete(blocks, args.removeBlockId);
  },
  invert: (reader, args): InverseSpec | null => {
    const into = reader.get(blocks, args.blockId);
    const removed = reader.get(blocks, args.removeBlockId);
    if (!into || !removed) {
      return null;
    }
    return {
      mutation: splitBlock,
      args: {
        blockId: args.blockId,
        baseVersion: into.version,
        textBefore: into.text,
        newBlockId: removed.id,
        newKind: removed.kind,
        newText: removed.text,
        newChecked: removed.checked,
        newLanguage: removed.language,
        newPosition: removed.position,
        newVersion: removed.version
      },
      description: 'merge blocks'
    };
  }
});

/** Delete a block. Inverse: re-create it byte-exactly. */
export const deleteBlock = mutation({
  name: 'blocks.delete',
  args: t.object({ blockId: t.string() }),
  optimistic: (cache, args) => {
    cache.delete(blocks, args.blockId);
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(blocks, args.blockId);
    if (!row) {
      return null;
    }
    return {
      mutation: addBlock,
      args: {
        blockId: row.id,
        kind: row.kind,
        text: row.text,
        checked: row.checked,
        language: row.language,
        position: row.position,
        version: row.version
      },
      description: 'delete block'
    };
  }
});

/** Reorder: one fractional-position write. Inverse: move back. */
export const moveBlock = mutation({
  name: 'blocks.move',
  args: t.object({ blockId: t.string(), position: t.number() }),
  optimistic: (cache, args) => {
    if (cache.get(blocks, args.blockId)) {
      cache.update(blocks, args.blockId, { position: args.position });
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(blocks, args.blockId);
    if (!row) {
      return null;
    }
    return {
      mutation: moveBlock,
      args: { blockId: args.blockId, position: row.position },
      description: 'move block'
    };
  }
});
