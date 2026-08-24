/**
 * The ONE MDX pipeline, shared by every consumer of `content/`: the standalone
 * docs site, the wheel.dev website (its /docs entry AND its landing page), and
 * the docs vitest run. Frontmatter YAML
 * becomes each page's exported `frontmatter`; fenced code highlights at build
 * time with paired light/dark palettes (no client runtime — theme.css flips
 * which palette shows).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import mdx from '@mdx-js/rollup';
import rehypeShiki from '@shikijs/rehype';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import remarkGfm from 'remark-gfm';
import { createHighlighter, type Highlighter } from 'shiki';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Dual-theme build-time highlighting; `defaultColor: false` emits both palettes as CSS vars. */
export const SHIKI_OPTIONS = {
  themes: { light: 'github-light', dark: 'github-dark' },
  defaultColor: false
} as const;

/**
 * MDX → Solid JSX, with frontmatter and highlighting. Must run `enforce: 'pre'`
 * ahead of vite-plugin-solid (which then compiles the emitted JSX; that is why
 * `jsx: true` matters).
 */
export function docsMdxPlugin(): Plugin {
  return {
    enforce: 'pre',
    ...mdx({
      jsx: true,
      jsxImportSource: 'solid-js',
      remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter, remarkGfm],
      rehypePlugins: [[rehypeShiki, SHIKI_OPTIONS]]
    })
  } as Plugin;
}

/** Extensions the example loader can highlight, mapped to their shiki grammar. */
const EXAMPLE_LANGUAGES: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx'
};

/** `// #region name` / `// #endregion name` — the block markers inside an example file. */
const REGION_MARKER = /^\s*\/\/\s*#(region|endregion)\s+(\S+)\s*$/;

/** Marker lines are build metadata, not example code: they never reach the page. */
function stripMarkers(lines: readonly string[]): string {
  return lines
    .filter((line) => !REGION_MARKER.test(line))
    .join('\n')
    .trimEnd();
}

/**
 * Slices every `// #region name` block out of an example file. The slice
 * happens on SOURCE, before highlighting — cutting highlighted HTML instead
 * would mean cutting through open `<span>` tags.
 */
function sliceRegions(source: string, file: string): Record<string, string[]> {
  const lines = source.split('\n');
  const regions: Record<string, string[]> = {};
  const open = new Map<string, number>();
  lines.forEach((line, index) => {
    const match = REGION_MARKER.exec(line);
    if (!match) {
      return;
    }
    const [, kind, name] = match as unknown as [string, string, string];
    if (kind === 'region') {
      open.set(name, index);
      return;
    }
    const start = open.get(name);
    if (start === undefined) {
      throw new Error(`${file}: "// #endregion ${name}" has no matching "// #region ${name}".`);
    }
    open.delete(name);
    regions[name] = lines.slice(start + 1, index);
  });
  const unclosed = [...open.keys()];
  if (unclosed.length > 0) {
    throw new Error(`${file}: region(s) never closed: ${unclosed.join(', ')}.`);
  }
  return regions;
}

/**
 * Typechecked example files, highlighted at build time.
 *
 * `import example from '@docs/examples/x/y.ts?example'` used to be `?raw`, and
 * `?raw` is a string — which is why every `<CodeExample>` on the site rendered
 * as flat grey text while the fenced ``` blocks right next to it were in
 * color. This plugin loads the file itself and hands back
 *
 *   { source, full, regions: { [name]: html } }
 *
 * where `full` and every region are shiki HTML produced with the SAME
 * SHIKI_OPTIONS the MDX fences use — so both palettes ship as CSS variables
 * and theme.css's existing `.shiki` rules light both kinds of block the same
 * way, in light and dark, with no highlighter in the browser.
 *
 * Must run `enforce: 'pre'`: vite's own `load` fallback would otherwise read
 * the file as an ordinary module first.
 */
export function docsExamplePlugin(): Plugin {
  let highlighter: Promise<Highlighter> | undefined;
  return {
    name: 'docs-example',
    enforce: 'pre',
    async load(id) {
      const [file, query = ''] = id.split('?');
      if (!file || !new URLSearchParams(query).has('example')) {
        return null;
      }
      const extension = file.split('.').pop()!;
      const language = EXAMPLE_LANGUAGES[extension];
      if (!language) {
        throw new Error(`${file}: ?example cannot highlight ".${extension}" files.`);
      }
      highlighter ??= createHighlighter({
        themes: Object.values(SHIKI_OPTIONS.themes),
        langs: [...new Set(Object.values(EXAMPLE_LANGUAGES))]
      });
      const shiki = await highlighter;
      const source = await readFile(file, 'utf8');
      const render = (code: string) => shiki.codeToHtml(code, { lang: language, ...SHIKI_OPTIONS });
      const regions = Object.fromEntries(
        Object.entries(sliceRegions(source, file)).map(([name, lines]) => [
          name,
          render(stripMarkers(lines))
        ])
      );
      const module = {
        source,
        full: render(stripMarkers(source.split('\n'))),
        regions
      };
      return `export default ${JSON.stringify(module)};`;
    }
  };
}

/**
 * Aliases the docs content relies on: pages live in `content/docs/` and reach
 * their interactive components and typechecked examples through `@docs/*`, so
 * the content never encodes which app is building it. `content/website/` gets
 * the same treatment from `@website/*` (packages/website/vite.config.ts).
 */
export function docsContentAliases(): { find: RegExp; replacement: string }[] {
  return [
    { find: /^@docs\/components\//, replacement: `${here('./src/components')}/` },
    { find: /^@docs\/examples\//, replacement: `${here('./examples')}/` }
  ];
}
