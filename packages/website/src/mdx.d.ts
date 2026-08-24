/**
 * MDX modules compile to Solid components (vite: @mdx-js/rollup → solid).
 * Pages accept the `components` intrinsics map (see docs mdx-components.tsx).
 */
declare module '*.mdx' {
  import type { Component } from 'solid-js';
  const MDXComponent: Component<{ components?: Record<string, unknown> }>;
  /** The page's YAML frontmatter (remark-mdx-frontmatter). */
  export const frontmatter: Record<string, unknown> | undefined;
  export default MDXComponent;
}
