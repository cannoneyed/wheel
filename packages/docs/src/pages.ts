/**
 * The docs registry, discovered — every `content/docs/*.mdx` is a page.
 * Frontmatter YAML carries the title; the slug is the filename. Reading
 * order and sidebar grouping come from nav.ts, NOT from frontmatter.
 *
 * The two halves must agree, and this module refuses to load if they don't: a
 * page with no group entry, or a group entry with no page, throws right here
 * at import time. Every consumer — both shells and the docs vitest run — pays
 * that check on the first import, so "I added a page and it vanished from the
 * nav" is a red test suite instead of a silent hole.
 */
import type { Component } from 'solid-js';

import { NAV_GROUPS } from './nav';

/** An MDX page compiled to a Solid component; accepts the intrinsics map (see mdx-components.tsx). */
export type DocsPageComponent = Component<{
  components?: Record<string, unknown>;
}>;

/** One rendered docs page: slug (filename), frontmatter title, component. */
export interface DocsPage {
  readonly slug: string;
  readonly title: string;
  readonly component: DocsPageComponent;
}

/** One rendered sidebar section: the nav.ts group heading and its pages, in order. */
export interface DocsNavGroup {
  readonly id: string;
  readonly pages: readonly DocsPage[];
}

interface DocsPageModule {
  default: DocsPageComponent;
  frontmatter?: { title?: string };
}

const modules = import.meta.glob<DocsPageModule>('../../../content/docs/*.mdx', {
  eager: true
});

const discovered = new Map<string, DocsPage>(
  Object.entries(modules).map(([path, module]) => {
    const slug = path.split('/').pop()!.replace(/\.mdx$/, '');
    return [
      slug,
      { slug, title: module.frontmatter?.title ?? slug, component: module.default }
    ];
  })
);

const grouped = new Set(NAV_GROUPS.flatMap((group) => group.children));

const missingFromNav = [...discovered.keys()].filter((slug) => !grouped.has(slug));
if (missingFromNav.length > 0) {
  throw new Error(
    `docs/${missingFromNav.join('.mdx, docs/')}.mdx exists but is in no sidebar group. ` +
      'Add the slug to a group in packages/docs/src/nav.ts.'
  );
}

const missingPages = [...grouped].filter((slug) => !discovered.has(slug));
if (missingPages.length > 0) {
  throw new Error(
    `packages/docs/src/nav.ts lists ${missingPages.join(', ')}, but there is no ` +
      `docs/${missingPages[0]}.mdx. Remove the slug or add the page.`
  );
}

/** The sidebar, resolved: nav.ts group order, page order inside each group. */
export const NAV: readonly DocsNavGroup[] = NAV_GROUPS.map((group) => ({
  id: group.id,
  pages: group.children.map((slug) => discovered.get(slug)!)
}));

/** The one docs routing, rendering, and test registry — flat, in sidebar order. */
export const PAGES: readonly DocsPage[] = NAV.flatMap((group) => group.pages);
