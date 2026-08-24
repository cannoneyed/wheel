/**
 * Inline markdown ↔ ProseMirror inline JSON — the codec between a block
 * row's `text` column and the content of its editor node.
 *
 * Only INLINE syntax lives here (bold/italic/code/strike/links); block-level
 * structure is the row's `kind` column, never a `#` prefix in text. The two
 * directions must round-trip: `serializeInline(parseInline(s))` returns `s`
 * for any string `serializeInline` can produce, so committing an untouched
 * block never creates a phantom edit.
 *
 * Deliberately tiny: sequential scan, no HTML, no images, no nested links.
 * Unterminated markers (a lone `**`) stay literal text.
 */

/** ProseMirror inline JSON — the shape `Node.fromJSON` accepts for text. */
export interface InlineNode {
  type: 'text';
  text: string;
  marks?: InlineMark[];
}

export interface InlineMark {
  type: 'bold' | 'italic' | 'code' | 'strike' | 'link';
  attrs?: { href: string };
}

/** Marker → mark type, longest first so `**` wins over `*`. */
const MARKERS: ReadonlyArray<{ token: string; type: 'bold' | 'italic' | 'code' | 'strike' }> = [
  { token: '**', type: 'bold' },
  { token: '~~', type: 'strike' },
  { token: '`', type: 'code' },
  { token: '*', type: 'italic' }
];

/** Parse a block row's markdown text into ProseMirror inline nodes. */
export function parseInline(text: string): InlineNode[] {
  return mergeAdjacent(parseSpan(text, []));
}

function parseSpan(text: string, marks: InlineMark[]): InlineNode[] {
  const nodes: InlineNode[] = [];
  let plain = '';
  let index = 0;

  const flushPlain = () => {
    if (plain) {
      nodes.push(textNode(plain, marks));
      plain = '';
    }
  };

  while (index < text.length) {
    // Links: [label](url) — label parses inner marks, url is literal.
    if (text[index] === '[') {
      const link = matchLink(text, index);
      if (link) {
        flushPlain();
        const linkMarks = [...marks, { type: 'link', attrs: { href: link.href } } as InlineMark];
        nodes.push(...parseSpan(link.label, linkMarks));
        index = link.end;
        continue;
      }
    }
    const marker = MARKERS.find(
      (candidate) => text.startsWith(candidate.token, index) && !marks.some((mark) => mark.type === candidate.type)
    );
    if (marker) {
      const close = text.indexOf(marker.token, index + marker.token.length);
      // A marker needs a non-empty span and a closing token, else it's literal.
      if (close > index + marker.token.length) {
        flushPlain();
        const inner = text.slice(index + marker.token.length, close);
        const innerMarks = [...marks, { type: marker.type } as InlineMark];
        // Code spans are literal — no nested parsing inside backticks.
        if (marker.type === 'code') {
          nodes.push(textNode(inner, innerMarks));
        } else {
          nodes.push(...parseSpan(inner, innerMarks));
        }
        index = close + marker.token.length;
        continue;
      }
    }
    plain += text[index];
    index += 1;
  }
  flushPlain();
  return nodes;
}

function matchLink(text: string, start: number): { label: string; href: string; end: number } | null {
  const labelEnd = text.indexOf('](', start + 1);
  if (labelEnd === -1) {
    return null;
  }
  const hrefEnd = text.indexOf(')', labelEnd + 2);
  if (hrefEnd === -1) {
    return null;
  }
  const label = text.slice(start + 1, labelEnd);
  // No nested brackets in labels — keeps the scan unambiguous.
  if (!label || label.includes('[')) {
    return null;
  }
  return { label, href: text.slice(labelEnd + 2, hrefEnd), end: hrefEnd + 1 };
}

function textNode(text: string, marks: InlineMark[]): InlineNode {
  return marks.length ? { type: 'text', text, marks: marks.map((mark) => ({ ...mark })) } : { type: 'text', text };
}

/** Neighbors with identical marks collapse into one node (stable output). */
function mergeAdjacent(nodes: InlineNode[]): InlineNode[] {
  const merged: InlineNode[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (previous && sameMarks(previous.marks, node.marks)) {
      previous.text += node.text;
    } else {
      merged.push(node);
    }
  }
  return merged;
}

function sameMarks(a: InlineMark[] | undefined, b: InlineMark[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return (
    left.length === right.length &&
    left.every((mark, index) => mark.type === right[index].type && mark.attrs?.href === right[index].attrs?.href)
  );
}

/**
 * Serialize ProseMirror inline nodes back to markdown. Wrapping order is
 * fixed (link > bold > strike > italic > code, outermost first) so equal
 * content always serializes to identical text.
 */
export function serializeInline(nodes: readonly InlineNode[]): string {
  let out = '';
  // Emit runs that share an outer mark together so "**bo** **ld**" from a
  // split text node re-joins as "**bold**" when the marks agree.
  const WRAP_ORDER: ReadonlyArray<InlineMark['type']> = ['link', 'bold', 'strike', 'italic', 'code'];

  const emit = (span: readonly InlineNode[], depth: number): string => {
    if (span.length === 0) {
      return '';
    }
    const markType = WRAP_ORDER[depth];
    if (markType === undefined) {
      return span.map((node) => node.text).join('');
    }
    let result = '';
    let index = 0;
    while (index < span.length) {
      const mark = markOf(span[index], markType);
      // The run: consecutive nodes agreeing on this mark (same href for links).
      let end = index + 1;
      while (end < span.length && sameMarkValue(markOf(span[end], markType), mark)) {
        end += 1;
      }
      const inner = emit(span.slice(index, end), depth + 1);
      if (!mark) {
        result += inner;
      } else if (mark.type === 'link') {
        result += `[${inner}](${mark.attrs?.href ?? ''})`;
      } else {
        const token = MARKERS.find((candidate) => candidate.type === mark.type)!.token;
        result += `${token}${inner}${token}`;
      }
      index = end;
    }
    return result;
  };

  out = emit(nodes, 0);
  return out;
}

function markOf(node: InlineNode, type: InlineMark['type']): InlineMark | undefined {
  return node.marks?.find((mark) => mark.type === type);
}

function sameMarkValue(a: InlineMark | undefined, b: InlineMark | undefined): boolean {
  if (!a || !b) {
    return !a && !b;
  }
  return a.type === b.type && a.attrs?.href === b.attrs?.href;
}
