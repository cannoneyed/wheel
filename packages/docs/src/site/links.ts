/**
 * Every wheel.dev destination, in one place, for every surface that renders
 * the shared header: the landing page, /docs, /demos, and /components.
 *
 * The home page's MDX copy references these by key (`to="docs"`), so a URL
 * change is a one-line edit here and never a copy edit.
 */
export const LINKS = {
  docs: '/docs/',
  /** The robot documentation index (content/robots), served by robot-docs-plugin. */
  robotDocs: '/llms.txt',
  demos: '/demos',
  components: '/components/',
  github: 'https://github.com/cannoneyed/wheel'
};

/** The keys `home.mdx` may pass as a CTA target, and `SiteHeader` as `active`. */
export type LinkKey = keyof typeof LINKS;

/** Nav order, left to right. `home` is the brand and is not listed here. */
export const NAV: readonly { key: LinkKey; label: string }[] = [
  { key: 'docs', label: 'Docs' },
  { key: 'demos', label: 'Demos' },
  { key: 'components', label: 'Components' },
  { key: 'github', label: 'GitHub' }
];
