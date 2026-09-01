/**
 * Chalk's document schema: flat block nodes, one per Wheel row.
 *
 * Deliberately not starter-kit: no nested lists, no listItem wrappers — a
 * bullet is a top-level `bullet` node, period. Flat nodes keep the row ↔
 * node mapping trivial (doc.child(i) ↔ one BlockRow), which is what makes
 * the projection diff (projection.ts) and gesture interpretation
 * (behavior.ts) tractable.
 *
 * Every block node carries a `blockId` attribute — the wheel row id, the
 * join key for the whole design. Marks mirror the inline markdown codec
 * exactly (markdown.ts): bold, italic, code, strike, link.
 */
import { Mark, Node, type AnyExtension } from '@tiptap/core';

import type { Kind } from '../sync/editor.sync';

/** Row kind → editor node name. Headings share one node with a level attr. */
export function nodeNameForKind(kind: Kind): string {
  switch (kind) {
    case 'h1':
    case 'h2':
    case 'h3':
      return 'heading';
    case 'code':
      return 'codeBlock';
    default:
      return kind;
  }
}

/** Editor node (+attrs) → row kind. The inverse of nodeNameForKind. */
export function kindForNode(name: string, attrs: Record<string, unknown>): Kind {
  if (name === 'heading') {
    const level = Number(attrs.level ?? 1);
    return level === 2 ? 'h2' : level === 3 ? 'h3' : 'h1';
  }
  if (name === 'codeBlock') {
    return 'code';
  }
  return name as Kind;
}

/** The shared blockId attribute every block node declares. */
const blockIdAttribute = {
  blockId: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-block-id'),
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.blockId ? { 'data-block-id': attributes.blockId } : {}
  }
};

const DocumentNode = Node.create({
  name: 'doc',
  topNode: true,
  content: 'block+'
});

const TextNode = Node.create({
  name: 'text',
  group: 'inline'
});

const Paragraph = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  addAttributes: () => ({ ...blockIdAttribute }),
  parseHTML: () => [{ tag: 'p' }],
  renderHTML: ({ HTMLAttributes }) => ['p', HTMLAttributes, 0]
});

const Heading = Node.create({
  name: 'heading',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes: () => ({
    ...blockIdAttribute,
    level: { default: 1, parseHTML: (element: HTMLElement) => Number(element.tagName[1]) }
  }),
  parseHTML: () => [{ tag: 'h1' }, { tag: 'h2' }, { tag: 'h3' }],
  renderHTML: ({ node, HTMLAttributes }) => [`h${node.attrs.level as number}`, HTMLAttributes, 0]
});

const Bullet = Node.create({
  name: 'bullet',
  group: 'block',
  content: 'inline*',
  addAttributes: () => ({ ...blockIdAttribute }),
  parseHTML: () => [{ tag: 'div[data-kind="bullet"]' }, { tag: 'ul li', priority: 60 }],
  renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, 'data-kind': 'bullet' }, ['span', { class: 'block-text' }, 0]]
});

const Numbered = Node.create({
  name: 'number',
  group: 'block',
  content: 'inline*',
  addAttributes: () => ({ ...blockIdAttribute }),
  parseHTML: () => [{ tag: 'div[data-kind="number"]' }, { tag: 'ol li', priority: 60 }],
  renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, 'data-kind': 'number' }, ['span', { class: 'block-text' }, 0]]
});

const Todo = Node.create({
  name: 'todo',
  group: 'block',
  content: 'inline*',
  addAttributes: () => ({
    ...blockIdAttribute,
    checked: {
      default: false,
      parseHTML: (element: HTMLElement) => element.getAttribute('data-checked') === 'true',
      renderHTML: (attributes: Record<string, unknown>) => ({ 'data-checked': attributes.checked ? 'true' : 'false' })
    }
  }),
  parseHTML: () => [{ tag: 'div[data-kind="todo"]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'div',
    { ...HTMLAttributes, 'data-kind': 'todo' },
    // The checkbox is chrome, not content — contenteditable=false keeps the
    // caret out of it; behavior.ts turns clicks on it into setChecked.
    [
      'button',
      { class: 'todo-checkbox', type: 'button', contenteditable: 'false', tabindex: '-1' },
      node.attrs.checked ? '☑' : '☐'
    ],
    ['span', { class: 'block-text' }, 0]
  ]
});

const Quote = Node.create({
  name: 'quote',
  group: 'block',
  content: 'inline*',
  addAttributes: () => ({ ...blockIdAttribute }),
  parseHTML: () => [{ tag: 'blockquote' }],
  renderHTML: ({ HTMLAttributes }) => ['blockquote', HTMLAttributes, 0]
});

const CodeBlock = Node.create({
  name: 'codeBlock',
  group: 'block',
  content: 'text*',
  marks: '', // literal text only — no bold inside code blocks
  code: true,
  defining: true,
  addAttributes: () => ({
    ...blockIdAttribute,
    language: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => element.getAttribute('data-language'),
      renderHTML: (attributes: Record<string, unknown>) =>
        attributes.language ? { 'data-language': attributes.language } : {}
    }
  }),
  parseHTML: () => [{ tag: 'pre', preserveWhitespace: 'full' }],
  renderHTML: ({ HTMLAttributes }) => ['pre', HTMLAttributes, ['code', 0]]
});

const Divider = Node.create({
  name: 'divider',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ ...blockIdAttribute }),
  parseHTML: () => [{ tag: 'div[data-kind="divider"]' }, { tag: 'hr' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, 'data-kind': 'divider' }, ['hr']]
});

const Bold = Mark.create({
  name: 'bold',
  parseHTML: () => [{ tag: 'strong' }, { tag: 'b' }],
  renderHTML: () => ['strong', 0]
});

const Italic = Mark.create({
  name: 'italic',
  parseHTML: () => [{ tag: 'em' }, { tag: 'i' }],
  renderHTML: () => ['em', 0]
});

const Code = Mark.create({
  name: 'code',
  excludes: '_', // a code span carries no other marks — mirrors the codec
  parseHTML: () => [{ tag: 'code' }],
  renderHTML: () => ['code', 0]
});

const Strike = Mark.create({
  name: 'strike',
  parseHTML: () => [{ tag: 's' }, { tag: 'del' }],
  renderHTML: () => ['s', 0]
});

const Link = Mark.create({
  name: 'link',
  addAttributes: () => ({
    href: { default: '', parseHTML: (element: HTMLElement) => element.getAttribute('href') }
  }),
  parseHTML: () => [{ tag: 'a[href]' }],
  renderHTML: ({ HTMLAttributes }) => ['a', { ...HTMLAttributes, rel: 'noopener' }, 0]
});

/** The full schema bundle (no behavior — that's behavior.ts). */
export function schemaExtensions(): AnyExtension[] {
  return [DocumentNode, TextNode, Paragraph, Heading, Bullet, Numbered, Todo, Quote, CodeBlock, Divider, Bold, Italic, Code, Strike, Link];
}
