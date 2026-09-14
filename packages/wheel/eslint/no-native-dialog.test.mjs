/** wheel/no-native-dialog keeps modal behavior in Wheel's shared Dialog. */
import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import wheel from './index.mjs';

const linter = new Linter({ configType: 'flat' });

function verify(code) {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.tsx'],
        languageOptions: {
          parser: tsParser,
          parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' }
        },
        plugins: { wheel },
        rules: { 'wheel/no-native-dialog': 'error' }
      }
    ],
    { filename: 'packages/app/src/dialog.tsx' }
  );
}

describe('no-native-dialog', () => {
  it.each([
    '<div role="dialog" />',
    '<section role="alertdialog" />',
    '<div aria-modal />',
    '<div aria-modal="true" />',
    '<div aria-modal={true} />',
    '<div aria-modal={"true"} />'
  ])('flags native dialog semantics in %s', (jsx) => {
    const messages = verify(`export const Example = () => ${jsx};`);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('wheel/components/dialog');
  });

  it.each([
    '<div />',
    '<div aria-modal="false" />',
    '<div aria-modal={isModal()} />',
    '<Dialog.Root><Dialog.Popup /></Dialog.Root>'
  ])('accepts non-modal or shared Dialog markup in %s', (jsx) => {
    expect(verify(`export const Example = () => ${jsx};`)).toHaveLength(0);
  });

  it('accepts an adjacent justified low-level exception', () => {
    expect(
      verify(
        '// wheel-native-dialog: embedded editor owns focus and keyboard routing here\n' +
          'export const Example = () => <div role="dialog" />;'
      )
    ).toHaveLength(0);
  });

  it('rejects an empty exception', () => {
    expect(
      verify('// wheel-native-dialog: TODO\nexport const Example = () => <div role="dialog" />;')
    ).toHaveLength(1);
  });
});
