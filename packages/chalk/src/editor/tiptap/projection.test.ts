// @vitest-environment node
/**
 * Chalk projection without a mounted editor: the markdown codec's
 * round-trip guarantee (an untouched block must never commit a phantom
 * edit), and rows → doc diffing on the real ProseMirror model — replace one
 * block, insert, delete, move, and the dirty-block hold-back.
 */
import { describe, expect, test } from 'vitest';
import { getSchema } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';

import type { Block } from '../sync/editor.sync';
import { parseInline, serializeInline } from './markdown';
import { docJsonFromRows, positionedBlocks, projectRowsIntoTransaction, textOfNode } from './projection';
import { schemaExtensions } from './schema';

const schema = getSchema(schemaExtensions());

function row(id: string, text: string, position: number, overrides: Partial<Block> = {}): Block {
  return { id, kind: 'paragraph', text, checked: null, language: null, position, version: 1, ...overrides };
}

function stateFor(rows: Block[]): EditorState {
  return EditorState.create({ schema, doc: schema.nodeFromJSON(docJsonFromRows(rows)) });
}

/** Apply the projection and return the new doc's [id, text] pairs. */
function project(state: EditorState, rows: Block[], dirtyBlockId?: string | null) {
  const tr = state.tr;
  const applied = projectRowsIntoTransaction(tr, schema, rows, { dirtyBlockId });
  const doc = tr.doc;
  return { applied, doc, order: positionedBlocks(doc).map((block) => [block.id, textOfNode(block.node)]) };
}

describe('inline markdown codec', () => {
  const cases = [
    'plain text',
    'some **bold** words',
    '*italic* and `code` and ~~strike~~',
    'a [link](https://example.com) inline',
    '**bold with *italic* inside**',
    'unterminated ** stays literal',
    '',
    '`const x = 1;`'
  ];
  for (const text of cases) {
    test(`round-trips: ${JSON.stringify(text)}`, () => {
      expect(serializeInline(parseInline(text))).toBe(text);
    });
  }

  test('parse produces marked nodes', () => {
    expect(parseInline('a **b** c')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' c' }
    ]);
  });
});

describe('rows → doc projection', () => {
  test('matching rows apply zero steps (our own commit echoing back)', () => {
    const rows = [row('a', 'one **bold**', 0), row('b', 'two', 1)];
    const { applied } = project(stateFor(rows), rows);
    expect(applied).toBe(0);
  });

  test('a changed block is replaced; the rest are untouched', () => {
    const rows = [row('a', 'one', 0), row('b', 'two', 1)];
    const next = [row('a', 'one EDITED', 0, { version: 2 }), row('b', 'two', 1)];
    const { applied, order } = project(stateFor(rows), next);
    expect(applied).toBe(1);
    expect(order).toEqual([
      ['a', 'one EDITED'],
      ['b', 'two']
    ]);
  });

  test('kind changes replace the node type', () => {
    const rows = [row('a', 'title', 0)];
    const next = [row('a', 'title', 0, { kind: 'h1', version: 2 })];
    const { doc } = project(stateFor(rows), next);
    expect(doc.child(0).type.name).toBe('heading');
    expect(doc.child(0).attrs.level).toBe(1);
  });

  test('insert lands after its preceding row, delete removes, move reorders', () => {
    const rows = [row('a', 'one', 0), row('b', 'two', 1), row('c', 'three', 2)];
    // b deleted, n inserted after a, c moved before a.
    const next = [row('c', 'three', -1), row('a', 'one', 0), row('n', 'new', 0.5)];
    const { order } = project(stateFor(rows), next);
    expect(order).toEqual([
      ['c', 'three'],
      ['a', 'one'],
      ['n', 'new']
    ]);
  });

  test('the dirty block is held back — remote text does NOT clobber typing', () => {
    const rows = [row('a', 'my typing in progress', 0), row('b', 'two', 1)];
    const next = [row('a', 'peer overwrote this', 0, { version: 5 }), row('b', 'two EDITED', 1, { version: 2 })];
    const { order } = project(stateFor(rows), next, 'a');
    expect(order).toEqual([
      ['a', 'my typing in progress'],
      ['b', 'two EDITED']
    ]);
  });

  test('the dirty block survives even a remote delete', () => {
    const rows = [row('a', 'still typing here', 0), row('b', 'two', 1)];
    const next = [row('b', 'two', 1)];
    const { order } = project(stateFor(rows), next, 'a');
    expect(order).toEqual([
      ['a', 'still typing here'],
      ['b', 'two']
    ]);
  });

  test('undo-of-typing: the cursor lands where the typing began, not at a random spot', () => {
    // The user typed " world" at the end (committed), then undid it. The row
    // comes back as "hello"; the doc still shows "hello world" with the
    // cursor at the end.
    const rows = [row('a', 'hello world', 0)];
    const state = stateFor(rows);
    const withCursor = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 12))); // after 'd'
    const tr = withCursor.tr;
    projectRowsIntoTransaction(tr, schema, [row('a', 'hello', 0, { version: 2 })]);
    // Cursor at the divergence point: right after 'hello' (pos 1 + offset 5).
    expect(tr.selection.$head.pos).toBe(6);
  });

  test('redo-of-typing: the cursor lands after the re-inserted text', () => {
    const rows = [row('a', 'hello', 0)];
    const state = stateFor(rows);
    const withCursor = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6))); // after 'o'
    const tr = withCursor.tr;
    projectRowsIntoTransaction(tr, schema, [row('a', 'hello world', 0, { version: 3 })]);
    expect(tr.selection.$head.pos).toBe(12); // after 'd'
  });

  test('a kind-only change keeps the cursor at its exact offset', () => {
    const rows = [row('a', 'title text', 0)];
    const state = stateFor(rows);
    const withCursor = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4))); // inside 'tit|le'
    const tr = withCursor.tr;
    projectRowsIntoTransaction(tr, schema, [row('a', 'title text', 0, { kind: 'h2', version: 2 })]);
    expect(tr.doc.child(0).type.name).toBe('heading');
    expect(tr.selection.$head.pos).toBe(4);
  });

  test('a mid-text undo places the cursor at the end of the changed region', () => {
    const rows = [row('a', 'abcXYZdef', 0)];
    const state = stateFor(rows);
    const withCursor = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 7))); // after 'Z'
    const tr = withCursor.tr;
    projectRowsIntoTransaction(tr, schema, [row('a', 'abcdef', 0, { version: 2 })]);
    expect(tr.selection.$head.pos).toBe(4); // after 'abc'
  });

  test('todo/code/divider fields project into attrs', () => {
    const rows: Block[] = [
      row('t', 'a task', 0, { kind: 'todo', checked: true }),
      row('c', 'const x = 1;\nconst y = 2;', 1, { kind: 'code', language: 'typescript' }),
      row('d', '', 2, { kind: 'divider' })
    ];
    const doc = schema.nodeFromJSON(docJsonFromRows(rows));
    expect(doc.child(0).type.name).toBe('todo');
    expect(doc.child(0).attrs.checked).toBe(true);
    expect(doc.child(1).type.name).toBe('codeBlock');
    expect(doc.child(1).attrs.language).toBe('typescript');
    expect(textOfNode(doc.child(1))).toBe('const x = 1;\nconst y = 2;');
    expect(doc.child(2).type.name).toBe('divider');
  });
});
