// @vitest-environment jsdom
/**
 * Chalk presence decorations against a real mounted editor (008 P3): dots for
 * focused peers, carets at offsets, and the typing preview replacing the
 * block's display — all as decorations, never as document content.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { Editor } from '@tiptap/core';

import type { Block } from '../sync/editor.sync';
import type { BlockPeer } from '../services/editor-service';
import { docJsonFromRows } from './projection';
import { PresenceExtension, updatePresence } from './presence';
import { schemaExtensions } from './schema';

function row(id: string, text: string, position: number): Block {
  return { id, docId: 'doc_demo', kind: 'paragraph', text, checked: null, language: null, indent: 0, position, version: 1 };
}

function peer(overrides: Partial<BlockPeer> = {}): BlockPeer {
  return {
    clientId: 'web_peer',
    color: 'rgb(10, 20, 30)',
    caretOffset: null,
    anchorOffset: null,
    previewText: null,
    ...overrides
  };
}

let editor: Editor;
let host: HTMLElement;

function mount(rows: Block[]): void {
  host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({ element: host, extensions: [...schemaExtensions(), PresenceExtension], content: docJsonFromRows(rows) });
}

afterEach(() => {
  editor?.destroy();
  host?.remove();
});

describe('presence decorations', () => {
  test('a focused peer renders a dot and a caret; the committed text stays visible', () => {
    mount([row('a', 'hello world', 0), row('b', 'other', 1)]);
    updatePresence(editor.view, new Map([['a', [peer({ caretOffset: 5 })]]]));

    expect(host.querySelectorAll('.peer-dot')).toHaveLength(1);
    expect(host.querySelectorAll('.peer-caret')).toHaveLength(1);
    expect(host.querySelector('.has-preview')).toBeNull();
    expect(host.textContent).toContain('hello world');
  });

  test('a selecting peer renders a highlighted range plus the caret', () => {
    mount([row('a', 'hello world', 0)]);
    updatePresence(editor.view, new Map([['a', [peer({ caretOffset: 8, anchorOffset: 2 })]]]));

    const selection = host.querySelectorAll('.peer-selection');
    expect(selection.length).toBeGreaterThan(0);
    // The inline decoration wraps exactly the selected slice of text.
    const selected = [...selection].map((span) => span.textContent).join('');
    expect(selected).toBe('llo wo');
    expect(host.querySelectorAll('.peer-caret')).toHaveLength(1);
  });

  test('a typing peer replaces the display: committed text hidden, preview + caret shown', () => {
    mount([row('a', 'hello world', 0)]);
    updatePresence(editor.view, new Map([['a', [peer({ caretOffset: 9, previewText: 'hello wonderful' })]]]));

    const previewBlock = host.querySelector('.has-preview');
    expect(previewBlock).not.toBeNull();
    expect(host.querySelector('.peer-preview')?.textContent).toBe('hello wonderful');
    expect(host.querySelectorAll('.preview-hidden').length).toBeGreaterThan(0);
    // The DOCUMENT still holds only the committed text — preview is pixels.
    expect(editor.state.doc.child(0).textContent).toBe('hello world');
    // The caret sits inside the preview at the offset.
    const preview = host.querySelector('.peer-preview')!;
    expect(preview.querySelector('.peer-caret')).not.toBeNull();
    expect(preview.childNodes[0].textContent).toBe('hello won');
  });

  test('clearing the map removes every decoration', () => {
    mount([row('a', 'hello', 0)]);
    updatePresence(editor.view, new Map([['a', [peer({ caretOffset: 1, previewText: 'hey' })]]]));
    expect(host.querySelector('.peer-preview')).not.toBeNull();

    updatePresence(editor.view, new Map());
    expect(host.querySelector('.peer-preview')).toBeNull();
    expect(host.querySelector('.peer-dot')).toBeNull();
    expect(host.textContent).toContain('hello');
  });
});
