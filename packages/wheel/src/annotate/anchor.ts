/**
 * Anchoring: how a note finds its target again later.
 *
 * The good anchor is a component instance id — `BoardCell:3-7` — because wheel
 * already forces those to be stable (`require-stable-instance-name` makes a
 * component with an identity prop name itself from that prop, so the id follows
 * the DATA and never shifts when a list reorders).
 *
 * But code changes. A component gets renamed, a row disappears, a whole screen
 * is rewritten. So an anchor stores four things and gives up in TIERS rather
 * than all at once:
 *
 *   1. the exact instance id is still mounted           → `exact`
 *   2. no, but exactly one component of that NAME is    → `renamed`
 *   3. several share the name — pick the one whose enclosing components
 *      match the recorded ancestors best                → `renamed`
 *   4. nothing matches                                  → `orphaned`
 *
 * An orphaned note is never deleted or silently re-pointed. It keeps its
 * rectangle, its screenshot, and the state it captured, and it says out loud
 * that the thing it described is gone — which is itself a useful finding.
 */
import type { DebugRegistry, InstanceRecord } from '../core/debug-registry';
import { serializeValue } from '../core/serialize';

import type { AnchorMatch, NoteAnchor, NoteRect, NoteTarget } from './types';

/** How many ancestor levels an anchor remembers — enough to disambiguate, short enough to stay readable. */
const ANCESTOR_DEPTH = 6;

/** How many levels a DOM-path fallback walks up before it stops being useful. */
const DOM_PATH_DEPTH = 6;

/** How much of a target's text an element anchor quotes to find it again. */
const QUOTE_LENGTH = 120;

/** A DOMRect as the note stores it. */
function toRect(rect: DOMRect | NoteRect): NoteRect {
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

/**
 * A plain CSS path to an element, walking up to six levels.
 *
 * This is the last-resort anchor for the case no component claims the element
 * at all. It is fragile by nature — that is why it is fourth in line, not first.
 */
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

/** A short quote of an element's text — what identifies a paragraph after it moves. */
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
 * a note over a region lists exactly what the ◰ tool would have listed.
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

/** Anchor a note to one picked component instance. */
export function anchorToInstance(registry: DebugRegistry, record: InstanceRecord): NoteAnchor {
  const element = liveElement(record);
  return {
    kind: 'instance',
    instanceId: record.instanceId,
    name: record.name,
    ancestors: ancestorsOf(registry, record),
    rect: element ? toRect(element.getBoundingClientRect()) : null,
    domPath: element ? domPathOf(element) : null,
    element: element ? describeElement(element) : null,
    text: element ? quoteOf(element) : null
  };
}

/**
 * Anchor a note to a plain DOM element, for pages wheel does not own.
 *
 * A docs paragraph or a landing headline has no component to name, so this
 * leans on what prose actually has: where it sits in the document, what kind
 * of element it is, and a quote of its text. The quote is the part that
 * survives an edit somewhere else on the page.
 */
export function anchorToElement(element: Element): NoteAnchor {
  const rect = element.getBoundingClientRect();
  return {
    kind: 'element',
    instanceId: null,
    name: null,
    ancestors: [],
    rect: toRect(rect),
    domPath: domPathOf(element),
    element: describeElement(element),
    text: quoteOf(element)
  };
}

/** Anchor a note to a dragged rectangle; the innermost component under it names the anchor. */
export function anchorToRegion(registry: DebugRegistry, rect: NoteRect): NoteAnchor {
  const [innermost] = targetsUnder(registry, rect, 1);
  const record = innermost ? registry.instance(innermost.instanceId) : undefined;
  return {
    kind: 'region',
    instanceId: innermost?.instanceId ?? null,
    name: innermost?.name ?? null,
    ancestors: record ? ancestorsOf(registry, record) : [],
    rect,
    domPath: null,
    element: null,
    text: null
  };
}

/** Anchor a note to the screen as a whole. */
export function anchorToPage(): NoteAnchor {
  return {
    kind: 'page',
    instanceId: null,
    name: null,
    ancestors: [],
    rect: null,
    domPath: null,
    element: null,
    text: null
  };
}

/** What re-finding an anchor produced: how good the match was, and what it landed on. */
export interface ResolvedAnchor {
  /** `exact`, `renamed` (found some other way), or `orphaned` (gone). */
  readonly match: AnchorMatch;
  /** The live instance, when the anchor named a component that is still mounted. */
  readonly record: InstanceRecord | null;
  /** The live element, for anchors on plain DOM. */
  readonly element: Element | null;
}

/**
 * Re-find an element anchor: its path first, then its words.
 *
 * The path is exact and brittle; the quote is fuzzy and durable. A docs
 * paragraph that moved down the page keeps its sentence, and that is what
 * finds it — the same trick a comment system uses to survive an edit.
 */
function resolveElement(anchor: NoteAnchor): ResolvedAnchor {
  if (typeof document === 'undefined') return { match: 'orphaned', record: null, element: null };
  if (anchor.domPath) {
    try {
      const found = document.querySelector(anchor.domPath);
      // The path alone is not proof: the same slot can hold different content
      // after an edit, so a recorded quote has to still agree.
      if (found && (!anchor.text || (found.textContent ?? '').includes(anchor.text))) {
        return { match: 'exact', record: null, element: found };
      }
    } catch {
      // A stored path that is no longer valid CSS is just a miss.
    }
  }
  if (anchor.text) {
    const candidates = document.querySelectorAll(anchor.element?.split('.')[0] ?? '*');
    for (const candidate of candidates) {
      if ((candidate.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(anchor.text)) {
        return { match: 'renamed', record: null, element: candidate };
      }
    }
  }
  return { match: 'orphaned', record: null, element: null };
}

/**
 * Re-find an anchor against the CURRENT component tree, degrading in tiers
 * (see the module doc). Never throws, never guesses silently: a `renamed`
 * result says the id moved, and `orphaned` says the target is gone.
 */
export function resolveAnchor(registry: DebugRegistry, anchor: NoteAnchor): ResolvedAnchor {
  if (anchor.kind === 'element') return resolveElement(anchor);
  if (anchor.instanceId) {
    const exact = registry.instance(anchor.instanceId);
    if (exact && (anchor.name === null || exact.name === anchor.name)) {
      return { match: 'exact', record: exact, element: null };
    }
  }
  if (anchor.name) {
    const sameName = registry.instances().filter((record) => record.name === anchor.name);
    if (sameName.length === 1) return { match: 'renamed', record: sameName[0]!, element: null };
    if (sameName.length > 1) {
      // Several candidates: the one whose enclosing components overlap the
      // recorded ancestors most is the best guess available.
      const wanted = new Set(anchor.ancestors);
      let best: InstanceRecord | null = null;
      let bestScore = -1;
      for (const record of sameName) {
        const score = ancestorsOf(registry, record).filter((id) => wanted.has(id)).length;
        if (score > bestScore) {
          best = record;
          bestScore = score;
        }
      }
      if (best) return { match: 'renamed', record: best, element: null };
    }
  }
  return { match: 'orphaned', record: null, element: null };
}
