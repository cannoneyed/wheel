import { For, Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { DocumentEditor, HistoryControls } from './editor';
import { EditorService, type DocState } from './editor/services/editor-service';

const connectChalk = connect('Chalk', (context) => {
  const chalk = context.service(EditorService);
  const splitCommentedBlock = () => {
    const comment = chalk.currentComments().find((row) => row.resolvedAt === null);
    const block = comment ? chalk.block(comment.blockId) : undefined;
    if (!block || block.text.length < 2) return;
    const splitAt = Math.max(1, Math.floor(block.text.length / 2));
    chalk.split(block.id, block.text.slice(0, splitAt), block.text.slice(splitAt), block.kind);
  };
  const mergeCommentedBlock = () => {
    const comment = chalk.currentComments().find((row) => row.resolvedAt === null);
    const rows = chalk.currentBlocks();
    const index = comment ? rows.findIndex((row) => row.id === comment.blockId) : -1;
    if (index <= 0) return;
    chalk.merge(rows[index - 1].id, `${rows[index - 1].text}${rows[index].text}`, rows[index].id);
  };
  const firstTwo = () => chalk.currentBlocks().slice(0, 2).map((row) => row.id);
  return view(
    {
      docs: () => chalk.documents.rows,
      docsStatus: () => chalk.documents.status.kind,
      doc: chalk.selectedDoc,
      docId: chalk.selectedDocId,
      blocks: chalk.currentBlocks,
      blocksStatus: () => chalk.blocksStatus().kind,
      comments: chalk.currentComments,
      commentsStatus: () => chalk.commentsStatus().kind,
      summary: () => chalk.summaries.rows.find((row) => row.docId === chalk.selectedDocId()),
      saveState: chalk.saveState,
      connection: chalk.connection,
      pending: chalk.pending,
      queued: chalk.queued,
      editState: () => chalk.editState()?.state ?? 'none',
      peers: () => chalk.currentBlocks().reduce((count, block) => count + chalk.peersOn(block.id).length, 0)
    },
    {
      selectDocument: chalk.selectDocument,
      createDocument: chalk.createDocument,
      updateDocument: chalk.updateDocument,
      archiveDocument: chalk.archiveDocument,
      addBlock: () => chalk.add(chalk.currentBlocks().at(-1)?.id),
      addComment: chalk.addComment,
      resolveComment: chalk.resolveComment,
      deleteComment: chalk.deleteComment,
      splitCommentedBlock,
      mergeCommentedBlock,
      indentFirstTwo: () => chalk.indentBlocks(firstTwo(), 1),
      outdentFirstTwo: () => chalk.indentBlocks(firstTwo(), -1),
      moveFirstTwoDown: () => chalk.moveBlocks(firstTwo(), 1),
      moveFirstTwoUp: () => chalk.moveBlocks(firstTwo(), -1),
      reverseServerOrder: chalk.reverseServerOrder
    }
  );
});

/** Collaborative document workflow used by the Chalk browser proofs. */
export function App() {
  const state = connectChalk({});
  let commentBody!: HTMLInputElement;

  const addComment = () => {
    const block = state.blocks[0];
    if (!block) return;
    if (state.addComment(block.id, block.text.length, commentBody.value)) commentBody.value = '';
  };

  return (
    <main use:componentRoot class="chalk-shell">
      <aside class="documents">
        <div class="brand">
          <span>Chalk</span>
          <button data-testid="new-document" onClick={() => state.createDocument()}>New</button>
        </div>
        <output data-testid="docs-status" class="query-status">documents: {state.docsStatus}</output>
        <nav aria-label="Documents">
          <For each={state.docs}>
            {(doc) => (
              <button
                data-testid={`doc-${doc.id}`}
                class="document-link"
                classList={{ active: state.docId === doc.id }}
                aria-current={state.docId === doc.id ? 'page' : undefined}
                onClick={() => state.selectDocument(doc.id)}
              >
                <span>{doc.icon}</span>
                <span>{doc.title}</span>
              </button>
            )}
          </For>
        </nav>
      </aside>

      <section class="document-workspace">
        <header class="document-header">
          <div class="metadata">
            <input
              data-testid="document-icon"
              class="icon-input"
              aria-label="Document icon"
              value={state.doc?.icon ?? ''}
              onChange={(event) => state.updateDocument({ icon: event.currentTarget.value })}
            />
            <input
              data-testid="document-title"
              class="title-input"
              aria-label="Document title"
              value={state.doc?.title ?? ''}
              onChange={(event) => state.updateDocument({ title: event.currentTarget.value })}
            />
            <select
              data-testid="document-status"
              aria-label="Document status"
              value={state.doc?.status ?? 'draft'}
              onChange={(event) => state.updateDocument({ status: event.currentTarget.value as DocState })}
            >
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="published">Published</option>
            </select>
          </div>
          <div class="save-panel">
            <strong data-testid="save-state">{state.saveState}</strong>
            <span data-testid="connection-state">{state.connection}</span>
            <span data-testid="outbox-state">pending {state.pending} · queued {state.queued}</span>
          </div>
        </header>

        <div class="toolbar" aria-label="Document commands">
          <HistoryControls />
          <button data-testid="add-block" onClick={() => state.addBlock()}>Add block</button>
          <button data-testid="indent-blocks" disabled={state.blocks.length < 2} onClick={() => state.indentFirstTwo()}>Indent first two</button>
          <button data-testid="outdent-blocks" disabled={state.blocks.length < 2} onClick={() => state.outdentFirstTwo()}>Outdent first two</button>
          <button data-testid="move-blocks-down" disabled={state.blocks.length < 3} onClick={() => state.moveFirstTwoDown()}>Move first two down</button>
          <button data-testid="move-blocks-up" disabled={state.blocks.length < 3} onClick={() => state.moveFirstTwoUp()}>Move first two up</button>
          <button data-testid="reverse-order" disabled={state.blocks.length < 2} onClick={() => state.reverseServerOrder()}>Reverse server order</button>
          <button data-testid="archive-document" disabled={state.docs.length < 2} onClick={() => state.archiveDocument()}>Archive</button>
        </div>

        <output data-testid="active-doc-id" class="visually-hidden">{state.docId}</output>
        <output data-testid="blocks-status" class="query-status">blocks: {state.blocksStatus}</output>
        <div class="editor-stage">
          <DocumentEditor />
        </div>
      </section>

      <aside class="comments-panel">
        <div class="comments-heading">
          <div>
            <strong>Comments</strong>
            <output data-testid="peer-count">{state.peers} peers</output>
          </div>
          <span data-testid="comments-status">{state.commentsStatus}</span>
        </div>
        <div class="comment-compose">
          <input ref={commentBody} data-testid="comment-body" aria-label="New comment" placeholder="Add a comment" />
          <button data-testid="add-comment" disabled={state.blocks.length === 0} onClick={addComment}>Add</button>
        </div>
        <div class="comment-tools">
          <button data-testid="split-commented" onClick={() => state.splitCommentedBlock()}>Split commented block</button>
          <button data-testid="merge-commented" onClick={() => state.mergeCommentedBlock()}>Merge commented block</button>
        </div>
        <div class="comments-list">
          <For each={state.comments}>
            {(comment) => {
              const block = () => state.blocks.find((row) => row.id === comment.blockId);
              return (
                <article data-testid={`comment-${comment.id}`} classList={{ resolved: comment.resolvedAt !== null }}>
                  <p>{comment.body}</p>
                  <small data-testid={`comment-anchor-${comment.id}`}>
                    {block()?.text.slice(0, 24) || 'Missing block'} · offset {comment.offset}
                  </small>
                  <div>
                    <button
                      data-testid={`resolve-${comment.id}`}
                      onClick={() => state.resolveComment(comment.id, comment.resolvedAt === null)}
                    >
                      {comment.resolvedAt === null ? 'Resolve' : 'Reopen'}
                    </button>
                    <button data-testid={`delete-${comment.id}`} onClick={() => state.deleteComment(comment.id)}>Delete</button>
                  </div>
                </article>
              );
            }}
          </For>
          <Show when={state.comments.length === 0}><p>No comments yet.</p></Show>
        </div>
        <div class="summary">
          <span data-testid="summary-blocks">{state.summary?.blockCount ?? 0} blocks</span>
          <span data-testid="summary-comments">{state.summary?.commentCount ?? 0} comments</span>
          <span data-testid="summary-open">{state.summary?.openCommentCount ?? 0} open</span>
        </div>
        <output data-testid="edit-state" class="visually-hidden">{state.editState}</output>
      </aside>
    </main>
  );
}
