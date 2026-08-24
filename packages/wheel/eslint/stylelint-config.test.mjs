import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

import config from '../../../stylelint.config.mjs';

async function ruleIds(code) {
  const result = await stylelint.lint({ code, config });
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
