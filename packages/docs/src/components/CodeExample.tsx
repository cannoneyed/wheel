/**
 * Renders a real, typechecked file from packages/docs/examples — the same file
 * `tsc` and eslint see, so a docs snippet can never drift from working code.
 *
 * The file arrives already highlighted. `import x from '…/y.ts?example'` is
 * handled by docsExamplePlugin (packages/docs/vite.mdx.ts), which slices the
 * `// #region` blocks and runs shiki over each one at BUILD time with the same
 * options the fenced ``` blocks use. Nothing highlights in the browser, and the
 * language comes from the file's extension rather than a prop that could lie.
 */
import { viewRoot } from 'wheel/core';

/** What `?example` hands back: the raw text, plus shiki HTML for the file and each region. */
export interface DocsExample {
  /** The example file verbatim, markers and all — for tests and copy-to-clipboard. */
  readonly source: string;
  /** The whole file as highlighted HTML (region marker lines stripped). */
  readonly full: string;
  /** Highlighted HTML per `// #region name` block. */
  readonly regions: Readonly<Record<string, string>>;
}

export interface CodeExampleProps {
  /** A `?example` module (see docsExamplePlugin). */
  example: DocsExample;
  /** Optional `// #region name` block inside that file; omit to show the whole file. */
  region?: string;
}

function highlighted(example: DocsExample, region?: string): string {
  if (!region) {
    return example.full;
  }
  const html = example.regions[region];
  if (html === undefined) {
    const available = Object.keys(example.regions).join(', ') || 'none';
    throw new Error(
      `Code example region "${region}" is missing. The file defines: ${available}.`
    );
  }
  return html;
}

/** One example block: build-time shiki HTML, dropped in as-is. */
export function CodeExample(props: CodeExampleProps) {
  return (
    <div
      use:viewRoot={{ name: 'CodeExample', props }}
      class="source-example"
      innerHTML={highlighted(props.example, props.region)}
    />
  );
}
