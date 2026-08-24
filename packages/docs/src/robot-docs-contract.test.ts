import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- the generator is plain ESM; this test checks its returned filenames.
import { checkRobotApiDocuments } from '../../../scripts/generate-robot-api.mjs';
// @ts-expect-error -- the published plugin is plain ESM; its runtime shape is checked below.
import wheelPlugin from '../../wheel/eslint/index.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const docsRoot = resolve(repoRoot, 'content/docs');
const robotRoot = resolve(repoRoot, 'content/robots');
const llmsSource = readFileSync(resolve(robotRoot, 'llms.txt'), 'utf8');

const humanPages = readdirSync(docsRoot)
  .filter((name) => name.endsWith('.mdx'))
  .map((name) => name.replace(/\.mdx$/, ''))
  .sort();

function markdownFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

describe('robot documentation contract', () => {
  it.each(humanPages)('%s.mdx has a robot counterpart', (slug) => {
    // The robot tree mirrors the human tree page for page. A new docs page with
    // no robot page is the failure this catches: agents would silently be
    // reading a documentation set with a hole in it.
    expect(existsSync(resolve(robotRoot, `${slug}.md`)), `${slug}.md is missing`).toBe(true);
  });

  it('keeps generated API pages synchronized with public source entries', () => {
    expect(checkRobotApiDocuments()).toEqual([]);
  });

  it('documents every registered ESLint rule for robots', () => {
    const linting = readFileSync(resolve(robotRoot, 'linting.md'), 'utf8');
    const ruleNames = Object.keys((wheelPlugin as { rules: Record<string, unknown> }).rules);
    expect(ruleNames.length).toBeGreaterThan(0);
    for (const ruleName of ruleNames) expect(linting).toContain(`\`${ruleName}\``);
  });

  it.each(humanPages)('lists %s.md in llms.txt', (slug) => {
    expect(llmsSource).toContain(`(${slug}.md)`);
  });

  it.each(markdownFiles(robotRoot))('%s has no broken relative Markdown link', (path) => {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1]!;
      if (/^(?:[a-z]+:|#)/i.test(href)) continue;
      const target = href.split('#', 1)[0]!;
      expect(existsSync(resolve(dirname(path), target)), `${path}: ${href}`).toBe(true);
    }
  });
});
