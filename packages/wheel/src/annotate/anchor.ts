/**
 * Anchoring: what a note is about.
 *
 * A note is a RECTANGLE you drew on the screen, and everything that was under
 * it when you drew it. There is one anchor kind because there is one
 * interaction — drawing the box IS picking the target.
 *
 * The anchor records two independent descriptions of what was under the box,
 * because a page may be a wheel app or may be plain prose, and an agent
 * reading the note later needs whichever one exists:
 *
 *   - the innermost COMPONENT under the box: its instance id (`BoardCell:3-7`),
 *     its manifest name, and its enclosing components;
 *   - the innermost ELEMENT under the box: its DOM path, what kind of element
 *     it is, and a quote of its text — which is all a docs paragraph has.
 *
 * Rectangles are VIEWPORT coordinates: where the thing was on screen at the
 * moment the note was written. A note is a description of a moment, not a
 * bookmark into the document, so nothing here tries to survive scrolling.
 */
import type { DebugRegistry, InstanceRecord } from '../core/debug-registry';
import { serializeValue } from '../core/serialize';

import type { NoteAnchor, NoteRect, NoteTarget } from './types';

/** How many ancestor levels an anchor remembers — enough to place it, short enough to stay readable. */
const ANCESTOR_DEPTH = 6;

/** How many levels a DOM path walks up before it stops being useful. */
const DOM_PATH_DEPTH = 6;

/** How much of a target's text an anchor quotes. */
const QUOTE_LENGTH = 120;

/**
 * Marks the annotator's own overlays, so a hit-test can look straight through
 * them. Exported because the chrome has to stamp it on everything it draws.
 */
export const CHROME_ATTRIBUTE = 'data-wheel-annotate-chrome';

/** A measured rectangle as the note stores it: viewport coordinates, unchanged. */
function toRect(rect: DOMRect): NoteRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/** True when two viewport rectangles overlap at all (the Figma marquee convention). */
function rectsIntersect(a: NoteRect, b: DOMRect): boolean {
  return a.x < b.right && a.x + a.width > b.left && a.y < b.bottom && a.y + a.height > b.top;
}

/** The first element of an instance that is actually in the document. */
function liveElement(record: InstanceRecord): Element | null {
  for (const element of record.elements) {
    if (element.isConnected) return element;
  }
  return null;
}

/** A short human description of an element: `button.primary`, `div#board`, `input`. */
export function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (element.id) return `${tag}#${element.id}`;
  const className = typeof element.className === 'string' ? element.className.trim() : '';
  const first = className.split(/\s+/).filter(Boolean)[0];
  return first ? `${tag}.${first}` : tag;
}

/** A plain CSS path to an element, walking up to six levels. */
export function domPathOf(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  let depth = 0;
  while (current && depth < DOM_PATH_DEPTH) {
    if (current.id) {
      parts.unshift(`#${current.id}`);
      break;
    }
    const parent: Element | null = current.parentElement;
    if (!parent) {
      parts.unshift(current.tagName.toLowerCase());
      break;
    }
    const tag = current.tagName.toLowerCase();
    const siblings = [...parent.children].filter((child) => child.tagName === current!.tagName);
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(current) + 1})` : tag);
    current = parent;
    depth += 1;
  }
  return parts.join(' > ');
}

/** A short quote of an element's text — what identifies a paragraph in prose. */
function quoteOf(element: Element): string | null {
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, QUOTE_LENGTH) : null;
}

/** Enclosing instance ids, outermost first, capped at {@link ANCESTOR_DEPTH}. */
function ancestorsOf(registry: DebugRegistry, record: InstanceRecord): string[] {
  const chain: string[] = [];
  let current: InstanceRecord | undefined = record;
  while (current && chain.length < ANCESTOR_DEPTH) {
    const parentId: string | null = registry.displayParentId(current);
    if (!parentId) break;
    chain.push(parentId);
    current = registry.instance(parentId);
  }
  return chain.reverse();
}

/** Project one mounted instance into the JSON a note stores. */
export function targetOf(registry: DebugRegistry, record: InstanceRecord): NoteTarget {
  const element = liveElement(record);
  return {
    instanceId: record.instanceId,
    name: record.name,
    kind: record.kind,
    parentId: registry.displayParentId(record),
    rect: element ? toRect(element.getBoundingClientRect()) : null,
    state: serializeValue(record.state()) as Record<string, unknown>,
    props: serializeValue(record.props()) as Record<string, unknown>,
    actions: record.actions
  };
}

/**
 * Every mounted instance whose DOM intersects a rectangle, innermost first.
 *
 * Same hit-test the inspector and the rich-screenshot capture already use, so
 * a note over an area lists exactly what the ◰ tool would have listed.
 */
export function targetsUnder(registry: DebugRegistry, rect: NoteRect, limit = 24): NoteTarget[] {
  const hits: Array<{ record: InstanceRecord; element: Element }> = [];
  for (const record of registry.instances()) {
    for (const element of record.elements) {
      if (element.isConnected && rectsIntersect(rect, element.getBoundingClientRect())) {
        hits.push({ record, element });
        break;
      }
    }
  }
  return hits
    .sort((a, b) => (b.element.contains(a.element) ? -1 : a.element.contains(b.element) ? 1 : 0))
    .slice(0, limit)
    .map(({ record }) => targetOf(registry, record));
}

/**
 * The deepest element the rectangle covers, found by hit-testing its middle.
 *
 * This is what makes a note on a page wheel does not own worth anything: a
 * docs paragraph has no component, but it does have a path and a sentence.
 *
 * The annotator's own chrome is skipped. It has to be: the marquee's shield
 * covers the whole page while you drag, so a plain hit-test answers "the
 * shield" every single time and the note describes the annotator instead of
 * the app.
 */
function elementUnder(rect: NoteRect): Element | null {
  // jsdom and other non-visual environments do not implement the hit-test.
  // Losing the DOM half of an anchor is a smaller loss than failing the note.
  if (typeof document === 'undefined') return null;
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  if (typeof document.elementsFromPoint === 'function') {
    for (const element of document.elementsFromPoint(x, y)) {
      if (!element.closest(`[${CHROME_ATTRIBUTE}]`)) return element;
    }
    return null;
  }
  if (typeof document.elementFromPoint !== 'function') return null;
  const element = document.elementFromPoint(x, y);
  return element?.closest(`[${CHROME_ATTRIBUTE}]`) ? null : element;
}

/**
 * Anchor a note to the rectangle that was drawn, describing what was under it
 * both ways: as a component, and as plain DOM.
 */
export function anchorToRegion(registry: DebugRegistry, rect: NoteRect): NoteAnchor {
  const [innermost] = targetsUnder(registry, rect, 1);
  const record = innermost ? registry.instance(innermost.instanceId) : undefined;
  const element = elementUnder(rect);
  return {
    rect,
    instanceId: innermost?.instanceId ?? null,
    name: innermost?.name ?? null,
    ancestors: record ? ancestorsOf(registry, record) : [],
    domPath: element ? domPathOf(element) : null,
    element: element ? describeElement(element) : null,
    text: element ? quoteOf(element) : null
  };
}
