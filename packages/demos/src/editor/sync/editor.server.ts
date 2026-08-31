/**
 * Editor server bindings — the authoritative half of editor.sync.ts.
 * Handlers mirror the optimistic handlers write-for-write; insert positions
 * are recomputed against AUTHORITATIVE neighbors so concurrent inserts land
 * deterministically and clients rebase onto the truth.
 */
import { positionBetween, sql } from 'wheel/sync';
import { serveMutation, serveQuery, type ServerTx } from 'wheel/sync/server';
import { addBlock, blockList, deleteBlock, editBlock, mergeBlock, moveBlock, splitBlock } from './editor.sync';

/**
 * Schema + seed rows for the demo server's fresh SQLite database (the default
 * backend). `checked` is a nullable `integer` boolean (SQLite has no boolean
 * type; the backend coerces 0/1 back to real booleans at its read seam),
 * `position` a `real`.
 */
export const EDITOR_SCHEMA = {
  create: [
    `create table blocks (
       id text primary key,
       kind text not null default 'paragraph',
       text text not null default '',
       checked integer,
       language text,
       position real not null default 0,
       version integer not null default 1)`
  ],
  seed: [
    `insert into blocks (id, kind, text, checked, language, position) values
       ('block_0190b62e-0000-7000-8000-000000000001', 'h1', 'The wheel editor', null, null, 0),
       ('block_0190b62e-0000-7000-8000-000000000002', 'paragraph', 'One **tiptap** editor, many blocks — every block is a synced row, and the editor is a *projection* of that state.', null, null, 1),
       ('block_0190b62e-0000-7000-8000-000000000003', 'bullet', 'Open two windows: edits converge live', null, null, 2),
       ('block_0190b62e-0000-7000-8000-000000000004', 'bullet', 'Type ~800ms, pause — that chunk is one undoable mutation', null, null, 3),
       ('block_0190b62e-0000-7000-8000-000000000005', 'todo', 'Try \`cmd+z\` — undo flows through wheel and syncs everywhere', 0, null, 4),
       ('block_0190b62e-0000-7000-8000-000000000006', 'quote', 'Structure changes (Enter, Backspace-merge) are wheel mutations the moment they happen.', null, null, 5),
       ('block_0190b62e-0000-7000-8000-000000000007', 'code', 'const state = connectEditor(props);', null, 'typescript', 6)`
  ]
};

export const blockListServer = serveQuery({
  query: blockList,
  sql: () => sql`select id, kind, text, checked, language, position, version
                 from blocks order by position, id`
});

/** Shared: authoritative insert position (mirrors insertPosition in editor.sync.ts). */
async function resolvePosition(
  tx: ServerTx,
  explicit: number | undefined,
  afterBlockId: string | undefined
): Promise<number> {
  if (explicit !== undefined) {
    return explicit;
  }
  if (afterBlockId !== undefined) {
    const [after] = await tx.sql<{ position: number }>`
      select position from blocks where id = ${afterBlockId}`;
    if (after) {
      const [next] = await tx.sql<{ position: number }>`
        select position from blocks where position > ${after.position}
        order by position asc limit 1`;
      return positionBetween(after.position, next?.position);
    }
  }
  const [last] = await tx.sql<{ position: number }>`
    select position from blocks order by position desc limit 1`;
  return positionBetween(last?.position, undefined);
}

export const addBlockServer = serveMutation({
  mutation: addBlock,
  handler: async (tx, args) => {
    const position = await resolvePosition(tx, args.position, args.afterBlockId);
    // Upsert mirrors cache.put semantics (redo of a restore may see the row).
    await tx.sql`insert into blocks (id, kind, text, checked, language, position, version)
                 values (${args.blockId}, ${args.kind ?? 'paragraph'}, ${args.text ?? ''},
                         ${args.checked ?? null}, ${args.language ?? null}, ${position}, ${args.version ?? 1})
                 on conflict (id) do update
                   set kind = excluded.kind, text = excluded.text, checked = excluded.checked,
                       language = excluded.language, position = excluded.position, version = excluded.version`;
  }
});

export const editBlockServer = serveMutation({
  mutation: editBlock,
  handler: async (tx, args) => {
    const patch = args.patch;
    if (patch.text !== undefined) await tx.sql`update blocks set text = ${patch.text} where id = ${args.blockId}`;
    if (patch.kind !== undefined) await tx.sql`update blocks set kind = ${patch.kind} where id = ${args.blockId}`;
    if (patch.checked !== undefined) await tx.sql`update blocks set checked = ${patch.checked} where id = ${args.blockId}`;
    if (patch.language !== undefined) await tx.sql`update blocks set language = ${patch.language} where id = ${args.blockId}`;
    await tx.sql`update blocks set version = version + 1 where id = ${args.blockId}`;
  }
});

export const splitBlockServer = serveMutation({
  mutation: splitBlock,
  handler: async (tx, args) => {
    await tx.sql`update blocks set text = ${args.textBefore}, version = version + 1
                 where id = ${args.blockId}`;
    const position = await resolvePosition(tx, args.newPosition, args.blockId);
    await tx.sql`insert into blocks (id, kind, text, checked, language, position, version)
                 values (${args.newBlockId}, ${args.newKind}, ${args.newText},
                         ${args.newChecked ?? null}, ${args.newLanguage ?? null}, ${position}, ${args.newVersion ?? 1})
                 on conflict (id) do update
                   set kind = excluded.kind, text = excluded.text, checked = excluded.checked,
                       language = excluded.language, position = excluded.position, version = excluded.version`;
  }
});

export const mergeBlockServer = serveMutation({
  mutation: mergeBlock,
  handler: async (tx, args) => {
    await tx.sql`update blocks set text = ${args.mergedText}, version = version + 1
                 where id = ${args.blockId}`;
    await tx.sql`delete from blocks where id = ${args.removeBlockId}`;
  }
});

export const deleteBlockServer = serveMutation({
  mutation: deleteBlock,
  handler: async (tx, args) => {
    await tx.sql`delete from blocks where id = ${args.blockId}`;
  }
});

export const moveBlockServer = serveMutation({
  mutation: moveBlock,
  handler: async (tx, args) => {
    await tx.sql`update blocks set position = ${args.position} where id = ${args.blockId}`;
  }
});
