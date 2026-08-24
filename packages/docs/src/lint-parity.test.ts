import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The eslint plugin is plain ESM with no build step, so the registry is read by
// importing it — the same object eslint.config.mjs consumes. No regex, no drift
// between "what the test thinks is registered" and what actually is.
// @ts-expect-error -- the plugin ships as untyped plain ESM (no build step, no
// .d.ts); the shape it exposes is asserted below rather than declared.
import wheelPlugin from '../../wheel/eslint/index.mjs';

// Docs content lives at content/docs/*.mdx. The runner starts either
// at the repo root (bun run test:docs) or inside packages/docs.
const repoRelativePages = resolve(process.cwd(), 'content/docs');
const pagesDirectory = existsSync(resolve(repoRelativePages, 'overview.mdx'))
  ? repoRelativePages
  : resolve(process.cwd(), '../../content/docs');

const lintingSource = readFileSync(`${pagesDirectory}/linting.mdx`, 'utf8');

/** Every rule name the plugin registers, sorted. */
const registeredRules = Object.keys(
  (wheelPlugin as { rules: Record<string, unknown> }).rules
).sort();

/**
 * Rule names claimed by the docs table: rows of `| \`rule-name\` | … |` under
 * the "The rules" heading. The leading-cell shape is what makes a mention a
 * documented rule rather than an incidental reference in prose.
 */
const documentedRules = [
  ...lintingSource.matchAll(/^\|\s*`([a-z][a-z0-9-]*)`\s*\|/gm)
]
  .map((match) => match[1]!)
  .sort();

describe('lint rule / docs parity', () => {
  it('registers at least one rule and documents at least one rule', () => {
    expect(registeredRules.length).toBeGreaterThan(0);
    expect(documentedRules.length).toBeGreaterThan(0);
  });

  it.each(registeredRules)(
    '`%s` has a row in the content/docs/linting.mdx rules table',
    (rule) => {
      expect(documentedRules).toContain(rule);
    }
  );

  it.each(documentedRules)(
    '`%s` documented in linting.mdx is a real registered rule',
    (rule) => {
      expect(registeredRules).toContain(rule);
    }
  );
});
