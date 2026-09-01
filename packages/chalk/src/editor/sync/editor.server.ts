import { positionBetween, rejection, sql } from 'wheel/sync';
import { serveMutation, serveQuery, type ServerTx } from 'wheel/sync/server/cloudflare';
import {
  addBlock,
  addComment,
  archiveDoc,
  blocksByDoc,
  commentsByDoc,
  createDoc,
  deleteBlock,
  deleteComment,
  docSummariesAll,
  docsAll,
  docsRecent,
  editBlock,
  editDoc,
  moveBlock,
  reanchorComment,
  resolveComment,
  setBlockOrder
} from './editor.sync';

export const EDITOR_SCHEMA = {
  create: [
    `create table if not exists docs (
       id text primary key,
       title text not null,
       icon text not null,
       status text not null,
       archived_at integer,
       updated_at integer not null,
       version integer not null)`,
    `create table if not exists blocks (
       id text primary key,
       doc_id text not null,
       kind text not null default 'paragraph',
       text text not null default '',
       checked integer,
       language text,
       indent integer not null default 0,
       position real not null default 0,
       server_order real not null default 0,
       version integer not null default 1)`,
    `create table if not exists comments (
       id text primary key,
       doc_id text not null,
       block_id text not null,
       offset integer not null,
       body text not null,
       resolved_at integer,
       created_at integer not null)`
  ],
  seed: [
    `insert or ignore into docs (id, title, icon, status, archived_at, updated_at, version) values
       ('doc_demo', 'The wheel editor', '✍️', 'draft', null, 1730000000000, 1),
       ('doc_notes', 'Release notes', '📝', 'review', null, 1730000000001, 1)`,
    `insert or ignore into blocks
       (id, doc_id, kind, text, checked, language, indent, position, server_order, version) values
       ('block_0190b62e-0000-7000-8000-000000000001', 'doc_demo', 'h1', 'The wheel editor', null, null, 0, 0, 0, 1),
       ('block_0190b62e-0000-7000-8000-000000000002', 'doc_demo', 'paragraph', 'One **tiptap** editor, many blocks — every block is a synced row, and the editor is a *projection* of that state.', null, null, 0, 1, 1, 1),
       ('block_0190b62e-0000-7000-8000-000000000003', 'doc_demo', 'bullet', 'Open two windows: edits converge live', null, null, 0, 2, 2, 1),
       ('block_0190b62e-0000-7000-8000-000000000004', 'doc_demo', 'bullet', 'Type ~800ms, pause — that chunk is one undoable mutation', null, null, 0, 3, 3, 1),
       ('block_0190b62e-0000-7000-8000-000000000005', 'doc_demo', 'todo', 'Try \`cmd+z\` — undo flows through wheel and syncs everywhere', 0, null, 0, 4, 4, 1),
       ('block_0190b62e-0000-7000-8000-000000000006', 'doc_demo', 'quote', 'Structure changes are grouped wheel mutations.', null, null, 0, 5, 5, 1),
       ('block_0190b62e-0000-7000-8000-000000000007', 'doc_demo', 'code', 'const state = connectEditor(props);', null, 'typescript', 0, 6, 6, 1),
       ('block_0190b62e-0000-7000-8000-000000000008', 'doc_notes', 'h1', 'Wheel 0.2.0', null, null, 0, 0, 0, 1),
       ('block_0190b62e-0000-7000-8000-000000000009', 'doc_notes', 'paragraph', 'Atomic command groups and durable local state are ready for real apps.', null, null, 0, 1, 1, 1)`,
    `insert or ignore into comments
       (id, doc_id, block_id, offset, body, resolved_at, created_at) values
       ('comment_seed', 'doc_demo', 'block_0190b62e-0000-7000-8000-000000000002', 12,
        'This comment stays anchored when the block splits.', null, 1730000000002)`
  ]
};

export const docsAllServer = serveQuery({
  query: docsAll,
  sql: () => sql`select id, title, icon, status, archived_at as "archivedAt",
                        updated_at as "updatedAt", version
                 from docs where archived_at is null order by updated_at desc, title, id`
});

export const docsRecentServer = serveQuery({
  query: docsRecent,
  sql: (params) =>
    sql`select id, title, icon, status, archived_at as "archivedAt",
               updated_at as "updatedAt", version
        from docs where archived_at is null and updated_at >= ${params.since}
        order by updated_at desc, title, id`
});

export const blocksByDocServer = serveQuery({
  query: blocksByDoc,
  sql: (params) =>
    sql`select id, doc_id as "docId", kind, text, checked, language, indent, position, version
        from blocks where doc_id = ${params.docId} order by server_order, position, id`
});

export const commentsByDocServer = serveQuery({
  query: commentsByDoc,
  sql: (params) =>
    sql`select id, doc_id as "docId", block_id as "blockId", offset, body,
               resolved_at as "resolvedAt", created_at as "createdAt"
        from comments where doc_id = ${params.docId} order by created_at, id`
});

export const docSummariesAllServer = serveQuery({
  query: docSummariesAll,
  sql: () => sql`
    select d.id as "docId",
           count(distinct b.id) as "blockCount",
           count(distinct c.id) as "commentCount",
           count(distinct case when c.resolved_at is null then c.id end) as "openCommentCount",
           d.updated_at as "updatedAt"
    from docs d
    left join blocks b on b.doc_id = d.id
    left join comments c on c.doc_id = d.id
    where d.archived_at is null
    group by d.id, d.updated_at
    order by d.updated_at desc, d.id`
});

export const createDocServer = serveMutation({
  mutation: createDoc,
  handler: async (tx, args, context) => {
    const updatedAt = context.now();
    await tx.sql`insert into docs (id, title, icon, status, archived_at, updated_at, version)
                 values (${args.docId}, ${args.title}, ${args.icon ?? '📄'}, 'draft', null, ${updatedAt}, 1)`;
    await tx.sql`insert into blocks
                 (id, doc_id, kind, text, checked, language, indent, position, server_order, version)
                 values (${args.blockId}, ${args.docId}, 'paragraph', '', null, null, 0, 0, 0, 1)`;
  }
});

export const editDocServer = serveMutation({
  mutation: editDoc,
  handler: async (tx, args, context) => {
    if (args.patch.title !== undefined) await tx.sql`update docs set title = ${args.patch.title} where id = ${args.docId}`;
    if (args.patch.icon !== undefined) await tx.sql`update docs set icon = ${args.patch.icon} where id = ${args.docId}`;
    if (args.patch.status !== undefined) await tx.sql`update docs set status = ${args.patch.status} where id = ${args.docId}`;
    if (args.version === undefined) {
      await tx.sql`update docs set updated_at = ${args.updatedAt ?? context.now()}, version = version + 1 where id = ${args.docId}`;
    } else {
      await tx.sql`update docs set updated_at = ${args.updatedAt ?? context.now()}, version = ${args.version} where id = ${args.docId}`;
    }
  }
});

export const archiveDocServer = serveMutation({
  mutation: archiveDoc,
  handler: async (tx, args, context) => {
    await tx.sql`update docs set archived_at = ${args.archivedAt}, updated_at = ${context.now()}, version = version + 1
                 where id = ${args.docId}`;
  }
});

async function resolvePosition(
  tx: ServerTx,
  docId: string,
  explicit: number | undefined,
  afterBlockId: string | undefined
): Promise<number> {
  if (explicit !== undefined) return explicit;
  if (afterBlockId !== undefined) {
    const [after] = await tx.sql<{ position: number }>`
      select position from blocks where id = ${afterBlockId} and doc_id = ${docId}`;
    if (after) {
      const [next] = await tx.sql<{ position: number }>`
        select position from blocks where doc_id = ${docId} and position > ${after.position}
        order by position asc limit 1`;
      return positionBetween(after.position, next?.position);
    }
  }
  const [last] = await tx.sql<{ position: number }>`
    select position from blocks where doc_id = ${docId} order by position desc limit 1`;
  return positionBetween(last?.position, undefined);
}

export const addBlockServer = serveMutation({
  mutation: addBlock,
  handler: async (tx, args) => {
    const position = await resolvePosition(tx, args.docId, args.position, args.afterBlockId);
    await tx.sql`insert into blocks
                 (id, doc_id, kind, text, checked, language, indent, position, server_order, version)
                 values (${args.blockId}, ${args.docId}, ${args.kind ?? 'paragraph'}, ${args.text ?? ''},
                         ${args.checked ?? null}, ${args.language ?? null}, ${args.indent ?? 0},
                         ${position}, ${position}, ${args.version ?? 1})
                 on conflict (id) do update set
                   doc_id = excluded.doc_id, kind = excluded.kind, text = excluded.text,
                   checked = excluded.checked, language = excluded.language, indent = excluded.indent,
                   position = excluded.position, server_order = excluded.server_order, version = excluded.version`;
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
    if (patch.indent !== undefined) await tx.sql`update blocks set indent = ${patch.indent} where id = ${args.blockId}`;
    await tx.sql`update blocks set version = version + 1 where id = ${args.blockId}`;
  }
});

export const deleteBlockServer = serveMutation({
  mutation: deleteBlock,
  handler: async (tx, args) => {
    await tx.sql`delete from comments where block_id = ${args.blockId}`;
    await tx.sql`delete from blocks where id = ${args.blockId}`;
  }
});

export const moveBlockServer = serveMutation({
  mutation: moveBlock,
  handler: async (tx, args) => {
    await tx.sql`update blocks set position = ${args.position}, server_order = ${args.position} where id = ${args.blockId}`;
  }
});

export const setBlockOrderServer = serveMutation({
  mutation: setBlockOrder,
  handler: async (tx, args) => {
    const rows = await tx.sql<{ id: string }>`select id from blocks where doc_id = ${args.docId}`;
    const current = new Set(rows.map((row) => row.id));
    if (
      current.size !== args.blockIds.length ||
      new Set(args.blockIds).size !== args.blockIds.length ||
      args.blockIds.some((id) => !current.has(id))
    ) {
      throw rejection('invalid_order', 'Block order must contain every document block exactly once.');
    }
    for (const [index, blockId] of args.blockIds.entries()) {
      await tx.sql`update blocks set server_order = ${index} where id = ${blockId} and doc_id = ${args.docId}`;
    }
  }
});

export const addCommentServer = serveMutation({
  mutation: addComment,
  handler: async (tx, args, context) => {
    await tx.sql`insert into comments (id, doc_id, block_id, offset, body, resolved_at, created_at)
                 values (${args.commentId}, ${args.docId}, ${args.blockId}, ${args.offset}, ${args.body},
                         ${args.resolvedAt ?? null}, ${args.createdAt ?? context.now()})
                 on conflict (id) do update set
                   doc_id = excluded.doc_id, block_id = excluded.block_id, offset = excluded.offset,
                   body = excluded.body, resolved_at = excluded.resolved_at, created_at = excluded.created_at`;
  }
});

export const reanchorCommentServer = serveMutation({
  mutation: reanchorComment,
  handler: async (tx, args) => {
    if (args.patch.blockId !== undefined) await tx.sql`update comments set block_id = ${args.patch.blockId} where id = ${args.commentId}`;
    if (args.patch.offset !== undefined) await tx.sql`update comments set offset = ${args.patch.offset} where id = ${args.commentId}`;
  }
});

export const resolveCommentServer = serveMutation({
  mutation: resolveComment,
  handler: async (tx, args) => {
    await tx.sql`update comments set resolved_at = ${args.resolvedAt} where id = ${args.commentId}`;
  }
});

export const deleteCommentServer = serveMutation({
  mutation: deleteComment,
  handler: async (tx, args) => {
    await tx.sql`delete from comments where id = ${args.commentId}`;
  }
});
