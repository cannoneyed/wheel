/**
 * wheel/require-service-name is auto-fixable, which is the only reason the
 * rule is affordable: every new app in the repo trips it once and takes the
 * fix. That makes the FIXER'S OUTPUT part of the contract — it lands in real
 * source, unreviewed, every time someone runs `eslint --fix`.
 *
 * It got that wrong once. The indent was measured from the class node, and
 * `export class Foo` starts the ClassDeclaration at column 7 rather than 0, so
 * every exported service got its new member indented nine spaces. Sixty-five
 * files in this repo carried that before it was noticed.
 */
import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import wheel from './index.mjs';

const linter = new Linter({ configType: 'flat' });

function fix(code) {
  return linter.verifyAndFix(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser, parserOptions: { sourceType: 'module' } },
        plugins: { wheel },
        rules: { 'wheel/require-service-name': 'error' }
      }
    ],
    { filename: 'service.ts' }
  ).output;
}

describe('require-service-name', () => {
  it('flags a service that never declares its name', () => {
    const messages = linter.verify(
      'class TodoService extends Service {}',
      [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tsParser, parserOptions: { sourceType: 'module' } },
          plugins: { wheel },
          rules: { 'wheel/require-service-name': 'error' }
        }
      ],
      { filename: 'service.ts' }
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('TodoService');
  });

  it('accepts one that does', () => {
    const messages = linter.verify(
      "class TodoService extends Service { static override serviceName = 'TodoService'; }",
      [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tsParser, parserOptions: { sourceType: 'module' } },
          plugins: { wheel },
          rules: { 'wheel/require-service-name': 'error' }
        }
      ],
      { filename: 'service.ts' }
    );
    expect(messages).toHaveLength(0);
  });

  it('indents its fix to the class, not past the export keyword', () => {
    const output = fix('export class TodoService extends Service {\n}\n');

    // Two spaces, like any other class member. Measuring the ClassDeclaration
    // node instead gave nine, because `export ` is seven characters.
    expect(output).toContain("\n  static override serviceName = 'TodoService';");
    expect(output).not.toMatch(/\n {3,}static override serviceName/);
  });

  it('indents its fix inside a nested class too', () => {
    const output = fix('function make() {\n  class TodoService extends Service {\n  }\n}\n');

    expect(output).toContain("\n    static override serviceName = 'TodoService';");
  });
});
