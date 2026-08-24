/**
 * wheel/require-keep-names covers installed Wheel dependencies as well as
 * source aliases, because wheelDevTools() now owns dev mode and build stamps.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Linter } from 'eslint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import wheel from './index.mjs';

const linter = new Linter({ configType: 'flat' });
let root;

beforeEach(() => {
  root = mkdtempSync(join(process.cwd(), 'packages/wheel/eslint/wheel-vite-lint-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function verify(code, manifest = { dependencies: { wheel: 'file:../wheel' } }) {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
        plugins: { wheel },
        rules: { 'wheel/require-keep-names': 'error' }
      }
    ],
    { filename: join(root, 'vite.config.ts') }
  );
}

describe('require-keep-names', () => {
  it('requires wheelDevTools for a package that depends on Wheel', () => {
    expect(verify(`export default { plugins: [solid()] };`).map((message) => message.ruleId)).toEqual([
      'wheel/require-keep-names'
    ]);
  });

  it('accepts wheelDevTools in a Wheel Vite config', () => {
    expect(verify(`export default { plugins: [solid(), wheelDevTools()] };`)).toEqual([]);
  });

  it('still covers a source alias without a Wheel dependency', () => {
    expect(
      verify(
        `export default { resolve: { alias: '../wheel/src/core/index.ts' }, plugins: [solid()] };`,
        { dependencies: {} }
      ).map((message) => message.ruleId)
    ).toEqual(['wheel/require-keep-names']);
  });

  it('ignores an unrelated Vite package', () => {
    expect(verify(`export default { plugins: [solid()] };`, { dependencies: {} })).toEqual([]);
  });
});
