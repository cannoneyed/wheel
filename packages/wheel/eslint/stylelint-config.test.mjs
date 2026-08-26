import stylelint from 'stylelint';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import config from '../../../stylelint.config.mjs';

async function ruleIds(code, codeFilename) {
  const result = await stylelint.lint({ code, config, codeFilename });
  return result.results.flatMap((file) => file.warnings.map((warning) => warning.rule));
}

describe('CSS color enforcement', () => {
  it('allows literal colors in custom-property declarations', async () => {
    expect(
      await ruleIds(`:root {
        --ink: #172033;
        --scrim: rgb(15 18 24 / 40%);
      }`)
    ).toEqual([]);
  });

  it('allows normal declarations to read custom properties', async () => {
    expect(await ruleIds(`.card { color: var(--ink); background: var(--scrim); }`)).toEqual([]);
  });

  it('rejects hex and color functions in normal declarations', async () => {
    expect(await ruleIds(`.card { color: #172033; box-shadow: 0 1px rgb(0 0 0 / 20%); }`)).toEqual([
      'declaration-property-value-disallowed-list',
      'declaration-property-value-disallowed-list'
    ]);
  });
});

describe('CSS motion enforcement', () => {
  it('allows exit-only motion', async () => {
    expect(
      await ruleIds(`.popup[data-ending-style] { opacity: 0; }`)
    ).toEqual([]);
  });

  it('rejects entry-motion selectors', async () => {
    expect(
      await ruleIds(`.popup[data-starting-style] { opacity: 0; }`)
    ).toEqual(['selector-disallowed-list']);
  });

  it('allows timing literals only in the component token source', async () => {
    const filename = resolve('packages/wheel/src/components/styles/tokens.css');
    expect(
      await ruleIds(`:root { --fade-out: 100ms; }`, filename)
    ).toEqual([]);
  });

  it('allows Wheel recipes to read timing tokens', async () => {
    const filename = resolve('packages/wheel/src/components/styles/recipes/fixture.css');
    expect(
      await ruleIds(
        `.popup { transition: opacity var(--fade-out) var(--ease-out); }`,
        filename
      )
    ).toEqual([]);
  });

  it('rejects timing literals and private timing tokens in Wheel recipes', async () => {
    const filename = resolve('packages/wheel/src/components/styles/recipes/fixture.css');
    expect(
      await ruleIds(
        `.popup {
          --private-duration: 120ms;
          transition: opacity 120ms ease-out;
        }`,
        filename
      )
    ).toEqual([
      'declaration-property-value-disallowed-list',
      'declaration-property-value-disallowed-list'
    ]);
  });
});
