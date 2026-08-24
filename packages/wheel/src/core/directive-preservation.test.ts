/**
 * Solid directive imports are source-level references that TypeScript cannot
 * infer from `use:name`. `verbatimModuleSyntax` keeps those value imports until
 * the Solid compiler turns the JSX directive into a function call.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('Solid directive import preservation', () => {
  it('keeps directive value imports without manual void sentinels', () => {
    const baseConfig = JSON.parse(readFileSync('tsconfig.base.json', 'utf8')) as {
      compilerOptions: { verbatimModuleSyntax?: boolean };
    };
    expect(baseConfig.compilerOptions.verbatimModuleSyntax).toBe(true);

    const output = ts.transpileModule(
      `import { componentRoot } from 'wheel/core';
       export const Example = () => <div use:componentRoot />;`,
      {
        compilerOptions: {
          jsx: ts.JsxEmit.Preserve,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          verbatimModuleSyntax: baseConfig.compilerOptions.verbatimModuleSyntax
        }
      }
    ).outputText;

    expect(output).toContain(`import { componentRoot } from 'wheel/core';`);
    expect(output).toContain('use:componentRoot');
    expect(output).not.toContain('void componentRoot');
  });
});
