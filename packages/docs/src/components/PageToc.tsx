/**
 * The right-hand "On this page" rail, shared by both docs shells (the
 * standalone site and wheel.dev's /docs entry).
 *
 * The outline is read back out of the rendered page rather than out of the
 * MDX: after a page renders, this walks the content element's `h2`/`h3`
 * elements, gives any that lack one a slug id derived from their text, and
 * lists them. That means no rehype plugin, no id bookkeeping in the prose, and
 * a heading added to a page shows up in the rail the moment it renders.
 *
 * "Where am I" updates when the document scrolls: the rail finds the last
 * heading above the reading line near the top of the viewport. Clicking an
 * entry scrolls there smoothly — as a button, not an anchor, because both
 * shells route on the URL hash and a `href="#section"` would throw the reader
 * off the page.
 */
import { For, createEffect, on, onCleanup } from 'solid-js';
import { Show, useSignal, viewRoot } from 'wheel/core';

/** One outline row: the heading's id, its text, and whether it is an h2 or an h3. */
export interface TocEntry {
  readonly id: string;
  readonly text: string;
  readonly level: 2 | 3;
}

/** Distance from the viewport top that counts as "the heading you are reading". */
const READING_LINE = 96;

/** `Live state & sync` → `live-state-sync`. Stable across renders because the text is. */
function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

/** Reads the outline out of a rendered page, assigning ids to headings that have none. */
function collectHeadings(container: HTMLElement): TocEntry[] {
  const used = new Set<string>();
  const entries: TocEntry[] = [];
  for (const heading of container.querySelectorAll<HTMLHeadingElement>('h2, h3')) {
    const text = (heading.textContent ?? '').trim();
    if (!text) {
      continue;
    }
    let id = heading.id || slugify(text);
    // Two sections can legitimately share a title ("Why", "Example"); the id
    // still has to address one element, so later duplicates get a suffix.
    for (let n = 2; used.has(id); n += 1) {
      id = `${slugify(text)}-${n}`;
    }
    used.add(id);
    heading.id = id;
    entries.push({ id, text, level: heading.tagName === 'H3' ? 3 : 2 });
  }
  return entries;
}

/** The last heading whose top has passed the reading line — the one you are under. */
function headingInView(entries: readonly TocEntry[]): string {
  let current = entries[0]?.id ?? '';
  for (const entry of entries) {
    const element = document.getElementById(entry.id);
    if (element && element.getBoundingClientRect().top <= READING_LINE) {
      current = entry.id;
    }
  }
  return current;
}

export function PageToc(props: {
  /** The page currently rendered — changing it rebuilds the outline. */
  slug: string;
  /** The element the page renders into; read after render, so a plain ref works. */
  container: () => HTMLElement | undefined;
}) {
  const [entries, setEntries] = useSignal<readonly TocEntry[]>([], 'entries');
  const [active, setActive] = useSignal('', 'active');

  // imperative boundary: headings only exist once the MDX page has rendered,
  // so the outline is read out of the DOM after each route change, and scroll
  // position is tracked with a scroll listener the effect owns.
  createEffect(
    on(
      () => props.slug,
      () => {
        const container = props.container();
        const found = container ? collectHeadings(container) : [];
        setEntries(found);
        setActive(found[0]?.id ?? '');
        if (found.length === 0) {
          return;
        }
        const updateActive = () => setActive(headingInView(found));
        window.addEventListener('scroll', updateActive, { passive: true });
        onCleanup(() => window.removeEventListener('scroll', updateActive));
      }
    )
  );

  const jumpTo = (entry: TocEntry) => {
    document.getElementById(entry.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(entry.id);
  };

  return (
    <Show when={entries().length > 0}>
      <nav use:viewRoot={{ name: 'PageToc', props }} class="page-toc" aria-label="On this page">
        <span class="sidebar-label">On this page</span>
        <For each={entries()}>
          {(entry) => (
            <button
              type="button"
              class={`page-toc-link level-${entry.level}`}
              classList={{ active: active() === entry.id }}
              onClick={() => jumpTo(entry)}
            >
              {entry.text}
            </button>
          )}
        </For>
      </nav>
    </Show>
  );
}
