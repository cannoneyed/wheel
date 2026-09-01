import { Linter } from 'eslint';
import { describe, expect, test } from 'vitest';

import rule from './rules/no-browser-support-in-production.mjs';

const linter = new Linter({ configType: 'flat' });

function verify(code) {
  return linter.verify(code, {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    plugins: { wheel: { rules: { 'no-browser-support-in-production': rule } } },
    rules: { 'wheel/no-browser-support-in-production': 'error' }
  });
}

describe('no-browser-support-in-production', () => {
  test('rejects browser support imports and allows shared server modules', () => {
    expect(verify("import './browser/support/test-server';")).toHaveLength(1);
    expect(verify("export * from '../browser/controller';")).toHaveLength(1);
    expect(verify("void import('./browser/support/faults');")).toHaveLength(1);
    expect(verify("import { servers } from './server/modules';")).toEqual([]);
  });
});
