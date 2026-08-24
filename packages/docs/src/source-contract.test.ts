import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Docs content lives at content/docs/*.mdx. The runner starts either at the
// repo root (bun run test:docs) or inside packages/docs.
const repoRelativePages = resolve(process.cwd(), 'content/docs');
const pagesDirectory = existsSync(resolve(repoRelativePages, 'overview.mdx'))
  ? repoRelativePages
  : resolve(process.cwd(), '../../content/docs');
const typedFence =
  /^```(?:ts|tsx|typescript|js|jsx)\s*\n([\s\S]*?)^```/gm;

// One case PER PAGE. A single `it` looping every file aborts at the first bad
// fence, hiding every other page's violations behind one failure — so a fix
// pass never sees the whole list.
const pageFiles = readdirSync(pagesDirectory)
  .filter((name) => name.endsWith('.mdx'))
  .sort();

describe('documentation source contract', () => {
  it.each(pageFiles)(
    '%s labels every unchecked inline code fragment',
    (filename) => {
      const source = readFileSync(`${pagesDirectory}/${filename}`, 'utf8');
      for (const match of source.matchAll(typedFence)) {
        const lines = match[1]!.trim().split('\n');
        expect(
          lines[0],
          `${filename} has an unlabeled inline TypeScript fragment`
        ).toMatch(/^\/\/ (?:Excerpt|Intentionally)/);
        if (lines.length > 10) {
          expect(
            lines[0],
            `${filename} has a substantial unchecked example; move it to packages/docs/examples and render it with CodeExample`
          ).toMatch(/^\/\/ Intentionally/);
        }
      }
    }
  );
});
