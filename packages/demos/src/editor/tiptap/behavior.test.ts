// @vitest-environment jsdom
/**
 * Gesture interpretation against a REAL mounted tiptap editor (jsdom):
 * keydown events run the actual keymap, and the hooks record what mutations
 * WOULD fire — Enter → split payloads (with markdown serialized from the
 * live doc), Backspace → merge/demote, "# " prefixes → kind changes. No
 * wheel client involved: this is purely the doc → mutation half.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

import type { Kind } from '../sync/editor.sync';
import { gestureExtension, type GestureHooks } from './behavior';
import { docJsonFromRows } from './projection';
import { schemaExtensions } from './schema';
import type { Block } from '../sync/editor.sync';

function row(id: string, text: string, position: number, overrides: Partial<Block> = {}): Block {
  return { id, kind: 'paragraph', text, checked: null, language: null, position, version: 1, ...overrides };
}

interface Recorded {
  splits: Array<{ blockId: string; textBefore: string; newText: string; newKind: Kind }>;
  merges: Array<{ intoBlockId: string; mergedText: string; removeBlockId: string }>;
  kinds: Array<{ blockId: string; kind: Kind }>;
}

let editor: Editor;
let recorded: Recorded;
let host: HTMLElement;

function mount(rows: Block[]): void {
  recorded = { splits: [], merges: [], kinds: [] };
  const hooks: GestureHooks = {
    split: (blockId, textBefore, newText, newKind) => recorded.splits.push({ blockId, textBefore, newText, newKind }),
    merge: (intoBlockId, mergedText, removeBlockId) => recorded.merges.push({ intoBlockId, mergedText, removeBlockId }),
    applyKind: (blockId, kind) => recorded.kinds.push({ blockId, kind }),
    setChecked: () => {},
    removeBlock: () => {}
  };
  host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({
    element: host,
    extensions: [...schemaExtensions(), gestureExtension(hooks)],
    content: docJsonFromRows(rows)
  });
}

/** Put the cursor at a content offset inside the block at doc index `index`. */
function placeCursor(index: number, offset: number): void {
  let pos = 0;
  for (let child = 0; child < index; child += 1) {
    pos += editor.state.doc.child(child).nodeSize;
  }
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos + 1 + offset)));
}

function pressKey(key: string): void {
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  editor?.destroy();
  host?.remove();
});

describe('gesture interpretation', () => {
  test('Enter mid-block: split carries markdown-serialized halves', () => {
    mount([row('a', 'hello **bold** world', 0)]);
    // Doc content: "hello bold world" (16 chars); cursor after "hello " (6).
    placeCursor(0, 6);
    pressKey('Enter');
    expect(recorded.splits).toEqual([{ blockId: 'a', textBefore: 'hello ', newText: '**bold** world', newKind: 'paragraph' }]);
    // The keymap swallowed the key — the doc itself is untouched (the
    // mutation + projection round trip owns the change).
    expect(editor.state.doc.childCount).toBe(1);
  });

  test('Enter in a bullet continues the list; in a heading it resets to paragraph', () => {
    mount([row('a', 'item', 0, { kind: 'bullet' }), row('b', 'title', 1, { kind: 'h2' })]);
    placeCursor(0, 4);
    pressKey('Enter');
    placeCursor(1, 5);
    pressKey('Enter');
    expect(recorded.splits).toEqual([
      { blockId: 'a', textBefore: 'item', newText: '', newKind: 'bullet' },
      { blockId: 'b', textBefore: 'title', newText: '', newKind: 'paragraph' }
    ]);
  });

  test('Enter on an EMPTY bullet escapes to paragraph instead of splitting', () => {
    mount([row('a', '', 0, { kind: 'bullet' })]);
    placeCursor(0, 0);
    pressKey('Enter');
    expect(recorded.splits).toEqual([]);
    expect(recorded.kinds).toEqual([{ blockId: 'a', kind: 'paragraph' }]);
  });

  test('Backspace at start of a paragraph merges into the previous block', () => {
    mount([row('a', 'first', 0), row('b', 'second', 1)]);
    placeCursor(1, 0);
    pressKey('Backspace');
    expect(recorded.merges).toEqual([{ intoBlockId: 'a', mergedText: 'firstsecond', removeBlockId: 'b' }]);
  });

  test('Backspace at start of a styled block demotes it to paragraph first', () => {
    mount([row('a', 'first', 0), row('b', 'a quote', 1, { kind: 'quote' })]);
    placeCursor(1, 0);
    pressKey('Backspace');
    expect(recorded.merges).toEqual([]);
    expect(recorded.kinds).toEqual([{ blockId: 'b', kind: 'paragraph' }]);
  });

  test('Backspace mid-block is ordinary character deletion — no mutation', () => {
    mount([row('a', 'first', 0), row('b', 'second', 1)]);
    placeCursor(1, 3);
    pressKey('Backspace');
    expect(recorded.merges).toEqual([]);
    expect(recorded.kinds).toEqual([]);
  });

  test('"# " prefix converts to h1 and strips the typed prefix from the doc', () => {
    mount([row('a', '', 0)]);
    editor.view.dispatch(editor.state.tr.insertText('#', 1, 1));
    placeCursor(0, 1);
    const handled = editor.view.someProp('handleTextInput', (handler) =>
      handler(editor.view, 2, 2, ' ', () => editor.state.tr)
    );
    expect(handled).toBe(true);
    expect(recorded.kinds).toEqual([{ blockId: 'a', kind: 'h1' }]);
    expect(editor.state.doc.child(0).textContent).toBe(''); // prefix gone
  });

  test('"- " only fires when the block is not already a bullet', () => {
    mount([row('a', '', 0, { kind: 'bullet' })]);
    editor.view.dispatch(editor.state.tr.insertText('-', 1, 1));
    placeCursor(0, 1);
    const handled = editor.view.someProp('handleTextInput', (handler) =>
      handler(editor.view, 2, 2, ' ', () => editor.state.tr)
    );
    expect(handled ?? false).toBe(false);
    expect(recorded.kinds).toEqual([]);
  });

  test('Enter in a code block inserts a literal newline locally', () => {
    mount([row('a', 'const x = 1;', 0, { kind: 'code', language: 'ts' })]);
    placeCursor(0, 12);
    pressKey('Enter');
    expect(recorded.splits).toEqual([]);
    expect(editor.state.doc.child(0).textContent).toBe('const x = 1;\n');
  });

  test('Enter on a code block trailing blank line splits out to a paragraph', () => {
    mount([row('a', 'const x = 1;\n', 0, { kind: 'code', language: 'ts' })]);
    placeCursor(0, 13);
    pressKey('Enter');
    expect(recorded.splits).toEqual([{ blockId: 'a', textBefore: 'const x = 1;', newText: '', newKind: 'paragraph' }]);
  });
});
