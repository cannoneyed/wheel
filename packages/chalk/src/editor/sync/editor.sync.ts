import {
  collection,
  mutation,
  orphan,
  patchMutation,
  positionBetween,
  presence,
  query,
  t,
  type Infer,
  type InverseSpec
} from 'wheel/sync';

export const DEFAULT_DOC_ID = 'doc_demo';

export const DocStatus = t.enum(['draft', 'review', 'published']);
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

export const DocRow = t.object({
  id: t.string(),
  title: t.string(),
  icon: t.string(),
  status: DocStatus,
  archivedAt: t.number().nullable(),
  updatedAt: t.number(),
  version: t.number()
});

export const BlockRow = t.object({
  id: t.string(),
  docId: t.string(),
  kind: BlockKind,
  text: t.string(),
  checked: t.boolean().nullable(),
  language: t.string().nullable(),
  indent: t.number(),
  position: t.number(),
  version: t.number()
});

export const CommentRow = t.object({
  id: t.string(),
  docId: t.string(),
  blockId: t.string(),
  offset: t.number(),
  body: t.string(),
  resolvedAt: t.number().nullable(),
  createdAt: t.number()
});

export const DocSummaryRow = t.object({
  docId: t.string(),
  blockCount: t.number(),
  commentCount: t.number(),
  openCommentCount: t.number(),
  updatedAt: t.number()
});

export type Doc = Infer<typeof DocRow>;
export type DocState = Infer<typeof DocStatus>;
export type Block = Infer<typeof BlockRow>;
export type Kind = Infer<typeof BlockKind>;
export type Comment = Infer<typeof CommentRow>;
export type DocSummary = Infer<typeof DocSummaryRow>;

export const docs = collection({ name: 'docs', type: DocRow, key: (row) => row.id });
export const blocks = collection({ name: 'blocks', type: BlockRow, key: (row) => row.id });
export const comments = collection({ name: 'comments', type: CommentRow, key: (row) => row.id });
export const docSummaries = collection({
  name: 'doc_summaries',
  type: DocSummaryRow,
  key: (row) => row.docId,
  keySpec: { fields: ['docId'] }
});

export const editorPresence = presence({
  name: 'editor',
  state: t.object({
    docId: t.string().nullable(),
    blockId: t.string().nullable(),
    caretOffset: t.number().nullable(),
    anchorOffset: t.number().nullable(),
    previewText: t.string().nullable()
  })
});

export const docsAll = query({
  name: 'docs.all',
  params: t.object({}),
  into: docs,
  projection: {
    filter: (row) => row.archivedAt === null,
    sort: (left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title)
  }
});

export const docsRecent = query({
  name: 'docs.recent',
  params: t.object({ since: t.number() }),
  into: docs,
  projection: {
    filter: (row, params) => row.archivedAt === null && row.updatedAt >= params.since,
    sort: (left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title)
  }
});

export const blocksByDoc = query({
  name: 'blocks.byDoc',
  params: t.object({ docId: t.string() }),
  into: blocks,
  projection: {
    filter: (row, params) => row.docId === params.docId,
    sort: (left, right) => left.position - right.position || left.id.localeCompare(right.id)
  }
});

export const commentsByDoc = query({
  name: 'comments.byDoc',
  params: t.object({ docId: t.string() }),
  into: comments,
  projection: {
    filter: (row, params) => row.docId === params.docId,
    sort: (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id)
  }
});

export const docSummariesAll = query({
  name: 'doc_summaries.all',
  params: t.object({}),
  into: docSummaries,
  dependsOn: ['docs', 'blocks', 'comments']
});

function insertPosition(rows: readonly Block[], docId: string, afterBlockId?: string): number {
  const scoped = rows.filter((row) => row.docId === docId);
  const after = afterBlockId ? scoped.find((row) => row.id === afterBlockId) : undefined;
  if (after) {
    const next = scoped
      .filter((row) => row.position > after.position)
      .sort((left, right) => left.position - right.position)[0];
    return positionBetween(after.position, next?.position);
  }
  const last = scoped.sort((left, right) => right.position - left.position)[0];
  return positionBetween(last?.position, undefined);
}

const DocPatch = t.object({
  title: t.string().optional(),
  icon: t.string().optional(),
  status: DocStatus.optional()
});

export const createDoc = mutation({
  name: 'docs.create',
  args: t.object({ docId: t.string(), blockId: t.string(), title: t.string(), icon: t.string().optional() }),
  optimistic: (cache, args, context) => {
    const updatedAt = context.now();
    cache.put(docs, {
      id: args.docId,
      title: args.title,
      icon: args.icon ?? '📄',
      status: 'draft',
      archivedAt: null,
      updatedAt,
      version: 1
    });
    cache.put(blocks, {
      id: args.blockId,
      docId: args.docId,
      kind: 'paragraph',
      text: '',
      checked: null,
      language: null,
      indent: 0,
      position: 0,
      version: 1
    });
  }
});

export const editDoc = mutation({
  name: 'docs.edit',
  args: t.object({
    docId: t.string(),
    patch: DocPatch,
    updatedAt: t.number().optional(),
    version: t.number().optional()
  }),
  optimistic: (cache, args, context) => {
    const row = cache.get(docs, args.docId);
    if (!row) throw orphan(`document ${args.docId} is gone`);
    cache.update(docs, args.docId, {
      ...args.patch,
      updatedAt: args.updatedAt ?? context.now(),
      version: args.version ?? row.version + 1
    });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(docs, args.docId);
    if (!row) return null;
    const patch: Record<string, unknown> = {};
    for (const field of Object.keys(args.patch)) patch[field] = row[field as keyof Doc];
    return {
      mutation: editDoc,
      args: { docId: row.id, patch, updatedAt: row.updatedAt, version: row.version },
      description: 'edit document'
    };
  }
});

export const archiveDoc = mutation({
  name: 'docs.archive',
  args: t.object({ docId: t.string(), archivedAt: t.number().nullable() }),
  optimistic: (cache, args, context) => {
    const row = cache.get(docs, args.docId);
    if (!row) throw orphan(`document ${args.docId} is gone`);
    cache.update(docs, args.docId, {
      archivedAt: args.archivedAt,
      updatedAt: context.now(),
      version: row.version + 1
    });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(docs, args.docId);
    return row
      ? { mutation: archiveDoc, args: { docId: row.id, archivedAt: row.archivedAt }, description: 'archive document' }
      : null;
  }
});

export const addBlock = mutation({
  name: 'blocks.add',
  args: t.object({
    blockId: t.string(),
    docId: t.string(),
    afterBlockId: t.string().optional(),
    kind: BlockKind.optional(),
    text: t.string().optional(),
    checked: t.boolean().nullable().optional(),
    language: t.string().nullable().optional(),
    indent: t.number().optional(),
    position: t.number().optional(),
    version: t.number().optional()
  }),
  optimistic: (cache, args) => {
    cache.put(blocks, {
      id: args.blockId,
      docId: args.docId,
      kind: args.kind ?? 'paragraph',
      text: args.text ?? '',
      checked: args.checked ?? null,
      language: args.language ?? null,
      indent: args.indent ?? 0,
      position: args.position ?? insertPosition(cache.list(blocks), args.docId, args.afterBlockId),
      version: args.version ?? 1
    });
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: deleteBlock,
    args: { blockId: args.blockId },
    description: 'add block'
  })
});

const BlockPatch = t.object({
  text: t.string().optional(),
  kind: BlockKind.optional(),
  checked: t.boolean().nullable().optional(),
  language: t.string().nullable().optional(),
  indent: t.number().optional()
});

export const editBlock = patchMutation({
  name: 'blocks.edit',
  args: t.object({ blockId: t.string(), baseVersion: t.number(), patch: BlockPatch }),
  collection: blocks,
  id: (args) => args.blockId,
  stamp: (_context, _args, row) => ({ version: row.version + 1 }),
  description: 'edit block'
});

export const deleteBlock = mutation({
  name: 'blocks.delete',
  args: t.object({ blockId: t.string() }),
  optimistic: (cache, args) => {
    if (!cache.get(blocks, args.blockId)) throw orphan(`block ${args.blockId} is gone`);
    cache.delete(blocks, args.blockId);
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(blocks, args.blockId);
    return row
      ? {
          mutation: addBlock,
          args: {
            blockId: row.id,
            docId: row.docId,
            kind: row.kind,
            text: row.text,
            checked: row.checked,
            language: row.language,
            indent: row.indent,
            position: row.position,
            version: row.version
          },
          description: 'delete block'
        }
      : null;
  }
});

export const moveBlock = mutation({
  name: 'blocks.move',
  args: t.object({ blockId: t.string(), position: t.number() }),
  optimistic: (cache, args) => {
    if (!cache.get(blocks, args.blockId)) throw orphan(`block ${args.blockId} is gone`);
    cache.update(blocks, args.blockId, { position: args.position });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(blocks, args.blockId);
    return row
      ? { mutation: moveBlock, args: { blockId: row.id, position: row.position }, description: 'move block' }
      : null;
  }
});

/** Server-owned order change used to prove order-only query updates. */
export const setBlockOrder = mutation({
  name: 'blocks.setOrder',
  args: t.object({ docId: t.string(), blockIds: t.array(t.string()) })
});

export const addComment = mutation({
  name: 'comments.add',
  args: t.object({
    commentId: t.string(),
    docId: t.string(),
    blockId: t.string(),
    offset: t.number(),
    body: t.string(),
    resolvedAt: t.number().nullable().optional(),
    createdAt: t.number().optional()
  }),
  optimistic: (cache, args, context) => {
    if (!cache.get(blocks, args.blockId)) throw orphan(`block ${args.blockId} is gone`);
    cache.put(comments, {
      id: args.commentId,
      docId: args.docId,
      blockId: args.blockId,
      offset: args.offset,
      body: args.body,
      resolvedAt: args.resolvedAt ?? null,
      createdAt: args.createdAt ?? context.now()
    });
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: deleteComment,
    args: { commentId: args.commentId },
    description: 'add comment'
  })
});

const CommentAnchorPatch = t.object({ blockId: t.string().optional(), offset: t.number().optional() });

export const reanchorComment = patchMutation({
  name: 'comments.reanchor',
  args: t.object({ commentId: t.string(), patch: CommentAnchorPatch }),
  collection: comments,
  id: (args) => args.commentId,
  description: 'move comment anchor'
});

export const resolveComment = mutation({
  name: 'comments.resolve',
  args: t.object({ commentId: t.string(), resolvedAt: t.number().nullable() }),
  optimistic: (cache, args) => {
    if (!cache.get(comments, args.commentId)) throw orphan(`comment ${args.commentId} is gone`);
    cache.update(comments, args.commentId, { resolvedAt: args.resolvedAt });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(comments, args.commentId);
    return row
      ? {
          mutation: resolveComment,
          args: { commentId: row.id, resolvedAt: row.resolvedAt },
          description: 'resolve comment'
        }
      : null;
  }
});

export const deleteComment = mutation({
  name: 'comments.delete',
  args: t.object({ commentId: t.string() }),
  optimistic: (cache, args) => {
    if (!cache.get(comments, args.commentId)) throw orphan(`comment ${args.commentId} is gone`);
    cache.delete(comments, args.commentId);
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(comments, args.commentId);
    return row
      ? {
          mutation: addComment,
          args: {
            commentId: row.id,
            docId: row.docId,
            blockId: row.blockId,
            offset: row.offset,
            body: row.body,
            resolvedAt: row.resolvedAt,
            createdAt: row.createdAt
          },
          description: 'delete comment'
        }
      : null;
  }
});
