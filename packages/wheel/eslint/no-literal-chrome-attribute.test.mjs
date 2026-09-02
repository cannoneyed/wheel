/**
 * wheel/no-literal-chrome-attribute: a marker attribute has one spelling.
 * See the rule's own header for the story it comes from.
 */
import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import wheel from './index.mjs';

const linter = new Linter({ configType: 'flat' });

function verify(code, filename = 'packages/wheel/src/annotate/rasterize.ts') {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
          parser: tsParser,
          parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' }
        },
        plugins: { wheel },
        rules: { 'wheel/no-literal-chrome-attribute': 'error' }
      }
    ],
    { filename }
  );
}

describe('no-literal-chrome-attribute', () => {
  it('flags the exact copy that went stale and broke every screenshot', () => {
    const messages = verify("const CHROME_SELECTOR = '[data-wheel-annotate-chrome]';");
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('core/chrome.ts');
  });

  it('flags the current name too, wherever it is written out', () => {
    expect(verify("element.closest('[data-wheel-chrome]');")).toHaveLength(1);
    expect(verify('element.closest(`[data-wheel-chrome]`);')).toHaveLength(1);
    expect(verify("document.body.innerHTML = '<div data-wheel-chrome=\"\"></div>';")).toHaveLength(1);
  });

  it('flags it as a JSX attribute, which is how chrome gets marked', () => {
    const messages = verify(
      'export const Shield = () => <div data-wheel-chrome="" />;',
      'packages/wheel/src/annotate/annotate-system.tsx'
    );
    expect(messages).toHaveLength(1);
  });

  it('accepts the constant, which is the whole point', () => {
    expect(
      verify(
        "import { CHROME_SELECTOR, chromeMark } from '../core/chrome';\n" +
          'export const ok = (el: Element) => el.closest(CHROME_SELECTOR);\n' +
          'export const Shield = () => <div {...chromeMark} />;',
        'packages/wheel/src/annotate/annotate-system.tsx'
      )
    ).toEqual([]);
  });

  it('leaves the module that defines it alone', () => {
    expect(
      verify(
        "export const CHROME_ATTRIBUTE = 'data-wheel-chrome';",
        'packages/wheel/src/core/chrome.ts'
      )
    ).toEqual([]);
  });

  it('says nothing about other wheel attributes, which have no such contract', () => {
    expect(verify("element.querySelector('[data-wheel-id]');")).toEqual([]);
    expect(verify("element.querySelector('[data-wheel-role]');")).toEqual([]);
  });
});
