/**
 * The docs sidebar, written down in one place. Reading order used to live in
 * each page's frontmatter as `order: N`, which meant inserting a page between
 * two others was a renumbering chore and the shape of the table of contents
 * was invisible — you had to open 27 files to see it.
 *
 * Here it is one list: groups in the order they appear, pages in the order
 * they appear inside their group. Adding a page means adding its slug to a
 * group. Forgetting to is a hard error at import time (see pages.ts), not a
 * page that silently drops off the nav.
 */

/** One sidebar section: its heading and the page slugs beneath it, in order. */
export interface NavGroup {
  readonly id: string;
  readonly children: readonly string[];
}

/** Every docs page, grouped. Every `content/docs/*.mdx` slug appears exactly once. */
export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'Basics', children: ['overview', 'getting-started', 'project-layout', 'walkthrough'] },
  {
    id: 'Building',
    children: [
      'state',
      'services',
      'components',
      'component-library',
      'debugging',
      'patterns',
      'routing',
      'framing'
    ]
  },
  {
    id: 'Data & Sync',
    children: [
      'data-patterns',
      'live-state',
      'server',
      'server-advanced',
      'derived-collections',
      'presence',
      'undo'
    ]
  },
  { id: 'Running It', children: ['auth', 'configuration', 'production', 'cloudflare'] },
  { id: 'Quality', children: ['testing', 'linting'] },
  {
    id: 'Reference',
    children: ['real-app', 'architecture', 'import-map', 'advanced', 'reference']
  }
];
