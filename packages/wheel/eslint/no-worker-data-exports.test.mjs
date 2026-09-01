import { Linter } from 'eslint';
import { describe, expect, test } from 'vitest';

import rule from './rules/no-worker-data-exports.mjs';

const linter = new Linter({ configType: 'flat' });

function verify(code) {
  return linter.verify(code, {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    plugins: { wheel: { rules: { 'no-worker-data-exports': rule } } },
    rules: { 'wheel/no-worker-data-exports': 'error' }
  });
}

describe('no-worker-data-exports', () => {
  test('rejects data exports and allows Worker entry points', () => {
    expect(verify('export const VERSION = 1;')).toHaveLength(1);
    expect(verify("export { VERSION } from './version';")).toHaveLength(1);
    expect(verify('export async function fetch() {}')).toEqual([]);
    expect(verify('export class Workspace {}')).toEqual([]);
    expect(verify('export default { fetch };')).toEqual([]);
  });
});
