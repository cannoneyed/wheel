import { type ServiceContext } from 'wheel/core';
import { KeyboardService } from 'wheel/kit';
import { positionBetween, SyncService, type MutationHandle } from 'wheel/sync';
import {
  DEFAULT_DOC_ID,
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
  editBlock,
  editDoc,
  editorPresence,
  moveBlock,
  reanchorComment,
  resolveComment,
  setBlockOrder,
  type Block,
  type Comment,
  type Doc,
  type DocState,
  type Kind
} from '../sync/editor.sync';

export type { Block, Comment, Doc, DocState, Kind };

export interface BlockPatch {
  text?: string;
  kind?: Kind;
  checked?: boolean | null;
  language?: string | null;
  indent?: number;
}

export interface BlockPeer {
  clientId: string;
  color: string;
  caretOffset: number | null;
  anchorOffset: number | null;
  previewText: string | null;
}

const PREVIEW_CAP_BYTES = 4096;

function peerColor(clientId: string): string {
  let hash = 0;
  for (let index = 0; index < clientId.length; index += 1) {
    hash = (hash * 31 + clientId.charCodeAt(index)) | 0;
  }
  // wheel-color: peer identity needs one stable hue per client, not a fixed chrome token
  return `hsl(${((hash % 360) + 360) % 360} 70% 45%)`;
}

/** Chalk's synced document state and product commands. */
export class EditorService extends SyncService {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'EditorService';

  constructor(context: ServiceContext) {
    super(context);
    const keyboard = this.service(KeyboardService);
    this.addCleanup(
      keyboard.register({
        id: 'editor.undo',
        key: 'mod+z',
        run: () => this.undo(),
        when: () => this.canUndo() || this.flushHook.get() !== null,
        inInputs: true
      })
    );
    this.addCleanup(
      keyboard.register({ id: 'editor.redo', key: 'mod+shift+z', run: () => this.redo(), when: this.canRedo, inInputs: true })
    );
  }

  readonly documents = this.liveQuery(docsAll, {});
  readonly summaries = this.liveQuery(docSummariesAll, {});
  private readonly blockQueries = this.liveQueryFor(blocksByDoc, (docId: string) => ({ docId }));
  private readonly commentQueries = this.liveQueryFor(commentsByDoc, (docId: string) => ({ docId }));
  private readonly selectedDocIdAtom = this.atom(DEFAULT_DOC_ID, 'selectedDocId');

  /** Compatibility view for the demos route, which always hosts the seeded document. */
  readonly list = this.liveQuery(blocksByDoc, { docId: DEFAULT_DOC_ID });
  readonly selectedDocId = this.computed(() => this.selectedDocIdAtom.get(), 'selectedDocId');
  readonly selectedDoc = this.computed(
    (): Doc | undefined => this.documents.rows.find((doc) => doc.id === this.selectedDocIdAtom.get()),
    'selectedDoc'
  );
  readonly currentBlocks = this.computed(
    (): readonly Block[] => this.blockQueries(this.selectedDocIdAtom.get()).rows,
    'currentBlocks'
  );
  readonly blocksStatus = this.computed(
    () => this.blockQueries(this.selectedDocIdAtom.get()).status,
    'blocksStatus'
  );
  readonly currentComments = this.computed(
    (): readonly Comment[] => this.commentQueries(this.selectedDocIdAtom.get()).rows,
    'currentComments'
  );
  readonly commentsStatus = this.computed(
    () => this.commentQueries(this.selectedDocIdAtom.get()).status,
    'commentsStatus'
  );

  private readonly flushHook = this.field<(() => void) | null>(null);

  readonly block = this.computedFor((blockId: string): Block | undefined =>
    this.currentBlocks().find((row) => row.id === blockId)
  );
  readonly comment = this.computedFor((commentId: string): Comment | undefined =>
    this.currentComments().find((row) => row.id === commentId)
  );

  readonly canUndo = this.clientRead((): boolean => this.client.canUndo());
  readonly canRedo = this.clientRead((): boolean => this.client.canRedo());
  readonly connection = this.clientRead(() => this.client.connectionStatus(), 'connection');
  readonly queued = this.clientRead(() => this.client.queuedMutations(), 'queued');
  readonly pending = this.clientRead(() => this.client.pendingMutations(), 'pending');
  readonly editState = this.clientRead(() => this.client.mutationState(editBlock).last, 'editState');
  readonly saveState = this.computed(() => {
    if (this.connection() !== 'connected' || this.queued() > 0) return 'Saved locally';
    return this.pending() > 0 ? 'Saving' : 'Saved';
  }, 'saveState');

  readonly peersOn = this.clientReadFor((blockId: string): readonly BlockPeer[] =>
    [...this.client.peers(editorPresence).valid.entries()]
      .filter(([, state]) => state.docId === this.selectedDocIdAtom.get() && state.blockId === blockId)
      .map(([clientId, state]) => ({
        clientId,
        color: peerColor(clientId),
        caretOffset: state.caretOffset,
        anchorOffset: state.anchorOffset,
        previewText: state.previewText
      }))
  );

  registerFlushHook(hook: () => void): () => void {
    this.flushHook.set(hook);
    return () => {
      if (this.flushHook.get() === hook) this.flushHook.set(null);
    };
  }

  readonly selectDocument = (docId: string): void => {
    if (docId === this.selectedDocIdAtom.get()) return;
    this.flushHook.get()?.();
    this.publishCursor(null);
    this.selectedDocIdAtom.set(docId);
  };

  readonly createDocument = (title = 'Untitled'): string => {
    const docId = this.client.newId('doc');
    const blockId = this.client.newId('block');
    this.mutate(createDoc, { docId, blockId, title });
    this.selectDocument(docId);
    return docId;
  };

  readonly updateDocument = (patch: { title?: string; icon?: string; status?: DocState }): void => {
    if (Object.keys(patch).length === 0 || !this.selectedDoc()) return;
    this.mutate(editDoc, { docId: this.selectedDocIdAtom.get(), patch });
  };

  readonly archiveDocument = (): void => {
    const doc = this.selectedDoc();
    if (!doc) return;
    this.mutate(archiveDoc, { docId: doc.id, archivedAt: this.now() });
    const next = this.documents.rows.find((candidate) => candidate.id !== doc.id);
    if (next) this.selectDocument(next.id);
  };

  readonly add = (afterBlockId?: string, kind?: Kind): string => {
    const blockId = this.client.newId('block');
    this.mutate(addBlock, {
      blockId,
      docId: this.selectedDocIdAtom.get(),
      ...(afterBlockId !== undefined ? { afterBlockId } : {}),
      ...(kind !== undefined ? { kind } : {}),
      ...(kind === 'todo' ? { checked: false } : {})
    });
    return blockId;
  };

  readonly commit = (blockId: string, patch: BlockPatch, baseVersion?: number): void => {
    const row = this.block(blockId);
    if (!row) return;
    const definedPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    ) as BlockPatch;
    if (!Object.entries(definedPatch).some(([field, value]) => row[field as keyof BlockPatch] !== value)) return;
    this.mutate(editBlock, { blockId, baseVersion: baseVersion ?? row.version, patch: definedPatch });
  };

  readonly setKind = (blockId: string, kind: Kind, text?: string): void => {
    const row = this.block(blockId);
    if (!row) return;
    this.commit(blockId, {
      kind,
      text: kind === 'divider' ? '' : text,
      checked: kind === 'todo' ? (row.checked ?? false) : null,
      language: kind === 'code' ? row.language : null
    });
  };

  readonly setChecked = (blockId: string, checked: boolean): void => this.commit(blockId, { checked });

  /** Split a block and move later comment anchors as one command. */
  readonly split = (
    blockId: string,
    textBefore: string,
    newText: string,
    newKind: Kind,
    baseVersion?: number
  ): string | null => {
    const row = this.block(blockId);
    if (!row) return null;
    const newBlockId = this.client.newId('block');
    const affected = this.currentComments().filter(
      (comment) => comment.blockId === blockId && comment.offset > textBefore.length
    );
    this.mutateGroup([
      { mutation: editBlock, args: { blockId, baseVersion: baseVersion ?? row.version, patch: { text: textBefore } } },
      {
        mutation: addBlock,
        args: {
          blockId: newBlockId,
          docId: row.docId,
          afterBlockId: blockId,
          kind: newKind,
          text: newText,
          checked: newKind === 'todo' ? false : null,
          indent: row.indent
        }
      },
      ...affected.map((comment) => ({
        mutation: reanchorComment,
        args: { commentId: comment.id, patch: { blockId: newBlockId, offset: comment.offset - textBefore.length } }
      })),
      { mutation: editDoc, args: { docId: row.docId, patch: {} } }
    ]);
    return newBlockId;
  };

  /** Merge a block and its comment anchors into another block as one command. */
  readonly merge = (blockId: string, mergedText: string, removeBlockId: string, baseVersion?: number): void => {
    const into = this.block(blockId);
    const removed = this.block(removeBlockId);
    if (!into || !removed) return;
    const offset = into.text.length;
    const affected = this.currentComments().filter((comment) => comment.blockId === removeBlockId);
    this.mutateGroup([
      { mutation: editBlock, args: { blockId, baseVersion: baseVersion ?? into.version, patch: { text: mergedText } } },
      ...affected.map((comment) => ({
        mutation: reanchorComment,
        args: { commentId: comment.id, patch: { blockId, offset: offset + comment.offset } }
      })),
      { mutation: deleteBlock, args: { blockId: removeBlockId } },
      { mutation: editDoc, args: { docId: into.docId, patch: {} } }
    ]);
  };

  readonly remove = (blockId: string): void => {
    const row = this.block(blockId);
    if (!row) return;
    const attached = this.currentComments().filter((comment) => comment.blockId === blockId);
    this.mutateGroup([
      ...attached.map((comment) => ({ mutation: deleteComment, args: { commentId: comment.id } })),
      { mutation: deleteBlock, args: { blockId } },
      { mutation: editDoc, args: { docId: row.docId, patch: {} } }
    ]);
  };

  readonly moveUp = (blockId: string): void => {
    const rows = this.currentBlocks();
    const index = rows.findIndex((row) => row.id === blockId);
    if (index <= 0) return;
    this.mutate(moveBlock, { blockId, position: positionBetween(rows[index - 2]?.position, rows[index - 1].position) });
  };

  readonly moveDown = (blockId: string): void => {
    const rows = this.currentBlocks();
    const index = rows.findIndex((row) => row.id === blockId);
    if (index < 0 || index >= rows.length - 1) return;
    this.mutate(moveBlock, { blockId, position: positionBetween(rows[index + 1].position, rows[index + 2]?.position) });
  };

  readonly indentBlocks = (blockIds: readonly string[], delta: number): MutationHandle | null => {
    const selected = new Set(blockIds);
    const rows = this.currentBlocks()
      .filter((row) => selected.has(row.id))
      .map((row) => ({ row, indent: Math.max(0, Math.min(6, row.indent + delta)) }))
      .filter(({ row, indent }) => row.indent !== indent);
    if (rows.length === 0) return null;
    return this.mutateGroup([
      ...rows.map(({ row, indent }) => ({
        mutation: editBlock,
        args: {
          blockId: row.id,
          baseVersion: row.version,
          patch: { indent }
        }
      })),
      { mutation: editDoc, args: { docId: this.selectedDocIdAtom.get(), patch: {} } }
    ]);
  };

  readonly moveBlocks = (blockIds: readonly string[], direction: -1 | 1): MutationHandle | null => {
    const original = this.currentBlocks();
    const rows = [...original];
    const selected = new Set(blockIds);
    const indexes = direction === -1 ? rows.keys() : [...rows.keys()].reverse();
    for (const index of indexes) {
      const other = index + direction;
      if (!selected.has(rows[index].id) || other < 0 || other >= rows.length || selected.has(rows[other].id)) continue;
      [rows[index], rows[other]] = [rows[other], rows[index]];
    }
    const calls = rows.flatMap((row, index) => {
      const old = original.find((candidate) => candidate.id === row.id)!;
      const position = original[index].position;
      return old.position === position ? [] : [{ mutation: moveBlock, args: { blockId: row.id, position } }];
    });
    if (calls.length === 0) return null;
    return this.mutateGroup([
      ...calls,
      { mutation: editDoc, args: { docId: this.selectedDocIdAtom.get(), patch: {} } }
    ]);
  };

  readonly reverseServerOrder = (): MutationHandle | null => {
    const rows = this.currentBlocks();
    if (rows.length < 2) return null;
    return this.mutate(setBlockOrder, {
      docId: this.selectedDocIdAtom.get(),
      blockIds: rows.map((row) => row.id).reverse()
    });
  };

  readonly addComment = (blockId: string, offset: number, body: string): string | null => {
    const block = this.block(blockId);
    if (!block || body.trim() === '') return null;
    const commentId = this.client.newId('comment');
    this.mutate(addComment, {
      commentId,
      docId: block.docId,
      blockId,
      offset: Math.max(0, Math.min(offset, block.text.length)),
      body: body.trim()
    });
    return commentId;
  };

  readonly resolveComment = (commentId: string, resolved: boolean): void => {
    if (!this.comment(commentId)) return;
    this.mutate(resolveComment, { commentId, resolvedAt: resolved ? this.now() : null });
  };

  readonly deleteComment = (commentId: string): void => {
    if (this.comment(commentId)) this.mutate(deleteComment, { commentId });
  };

  readonly undo = (): void => {
    this.flushHook.get()?.();
    this.client.undo();
  };

  readonly redo = (): void => {
    this.client.redo();
  };

  readonly publishCursor = (
    blockId: string | null,
    caretOffset: number | null = null,
    anchorOffset: number | null = null,
    previewText: string | null = null
  ): void => {
    const docId = blockId === null ? null : this.selectedDocIdAtom.get();
    const capped = previewText !== null && previewText.length > PREVIEW_CAP_BYTES ? null : previewText;
    this.client.setPresence(
      editorPresence,
      {
        docId,
        blockId,
        caretOffset: blockId === null ? null : caretOffset,
        anchorOffset: blockId === null ? null : (anchorOffset ?? caretOffset),
        previewText: blockId === null ? null : capped
      },
      blockId === null ? undefined : { coalesceMs: 120 }
    );
  };
}
