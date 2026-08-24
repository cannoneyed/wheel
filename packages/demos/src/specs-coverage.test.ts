/**
 * The repo-wide half of the 016 behavior contract. The lint rule
 * (wheel/require-behavior-id) proves every browser test names a real spec
 * row — single-file, at edit time. This test proves the REVERSE, which lint
 * cannot see: every spec row in packages/demos/specs/*.md has at least one
 * test claiming it. A row with no test is a promise the suite doesn't keep.
 *
 * Retired rows (struck through with ~~ID~~) are exempt — they stay in the
 * table as history but demand no coverage.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(process.cwd(), 'packages/demos');
const specsDir = resolve(packageRoot, 'specs');
const browserDir = resolve(packageRoot, 'browser');

function specRows(): { id: string; file: string }[] {
  const rows: { id: string; file: string }[] = [];
  for (const name of readdirSync(specsDir).filter((entry) => entry.endsWith('.md'))) {
    const text = readFileSync(resolve(specsDir, name), 'utf8');
    for (const line of text.split('\n')) {
      const match = /^\|\s*(~~)?([A-Z]+-\d{2,})(~~)?\s*\|/.exec(line);
      if (match && !match[1]) {
        rows.push({ id: match[2]!, file: name });
      }
    }
  }
  return rows;
}

function coveredIds(): Set<string> {
  const covered = new Set<string>();
  for (const name of readdirSync(browserDir).filter((entry) => entry.endsWith('.spec.ts'))) {
    const text = readFileSync(resolve(browserDir, name), 'utf8');
    for (const line of text.split('\n')) {
      if (!/\/\/ behavior:/.test(line)) continue;
      // Every id on the line counts — a test may prove secondary rows too:
      //   // behavior: ROUTING-04 (also SHELL-03: the cold load proves the fallback)
      for (const match of line.matchAll(/([A-Z]+-\d{2,})/g)) {
        covered.add(match[1]!);
      }
    }
  }
  return covered;
}

describe('behavior spec coverage', () => {
  it('every active spec row has at least one test claiming it', () => {
    const covered = coveredIds();
    const uncovered = specRows().filter((row) => !covered.has(row.id));
    expect(
      uncovered,
      `spec rows with no test:\n${uncovered.map((row) => `  ${row.id} (${row.file})`).join('\n')}`
    ).toEqual([]);
  });

  it('spec ids are unique across all spec files', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const row of specRows()) {
      const existing = seen.get(row.id);
      if (existing && existing !== row.file) {
        duplicates.push(`${row.id} in both ${existing} and ${row.file}`);
      }
      seen.set(row.id, row.file);
    }
    expect(duplicates).toEqual([]);
  });
});
