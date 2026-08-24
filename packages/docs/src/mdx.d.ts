/**
 * MDX modules compile to Solid components (vite: @mdx-js/rollup → solid).
 * Pages accept the `components` intrinsics map (see mdx-components.tsx).
 */
declare module '*.mdx' {
  import type { Component } from 'solid-js';
  const MDXComponent: Component<{ components?: Record<string, unknown> }>;
  /** The page's YAML frontmatter (remark-mdx-frontmatter). */
  export const frontmatter: Record<string, unknown> | undefined;
  export default MDXComponent;
}

/**
 * Example files imported with `?example` come back pre-highlighted — see
 * docsExamplePlugin in packages/docs/vite.mdx.ts. Only MDX pages import these
 * today, and MDX is not typechecked; the declaration exists so a .ts/.tsx file
 * that ever reaches for one gets the real shape instead of `any`.
 */
declare module '*?example' {
  const example: import('./components/CodeExample').DocsExample;
  export default example;
}
