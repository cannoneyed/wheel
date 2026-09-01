/**
 * wheel/require-component-role: a shared component's instances get names, not
 * mount-order numbers. See the rule's own header for the story.
 */
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
        rules: { 'wheel/require-component-role': 'error' }
      }
    ],
    { filename: 'app.tsx' }
  );
}

describe('require-component-role', () => {
  it('flags a shared component with nothing to tell its instances apart', () => {
    const messages = verify(
      "import { Button } from 'wheel/components';\nexport const A = () => <Button>add</Button>;"
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('data-wheel-role');
    expect(messages[0].message).toContain('Button(save)');
  });

  it('accepts one that says which instance it is', () => {
    expect(
      verify(
        "import { Button } from 'wheel/components';\n" +
          'export const A = () => <Button data-wheel-role="add">add</Button>;'
      )
    ).toHaveLength(0);
  });

  it('leaves components that are not shared alone', () => {
    // An app's own component names itself; this rule is about the ones that
    // are the same component in twenty places.
    expect(
      verify("import { Button } from './button';\nexport const A = () => <Button>add</Button>;")
    ).toHaveLength(0);
  });

  it('flags a compound ROOT, which is as anonymous as a bare one', () => {
    const messages = verify(
      "import { Dialog } from 'wheel/components';\nexport const A = () => <Dialog.Root />;"
    );
    expect(messages).toHaveLength(1);
  });

  it('leaves compound PARTS alone — they belong to the root above them', () => {
    // Tagging every `Dialog.Portal` and `Dialog.Backdrop` would bury the roots
    // that actually need telling apart.
    expect(
      verify(
        "import { Dialog } from 'wheel/components';\n" +
          'export const A = () => <Dialog.Portal><Dialog.Backdrop /></Dialog.Portal>;'
      )
    ).toHaveLength(0);
  });

  it('says nothing when a spread might already carry the role', () => {
    // The linter cannot see inside a spread, and guessing wrong would be noise
    // on a legitimate pattern.
    expect(
      verify(
        "import { Button } from 'wheel/components';\n" +
          'export const A = (props) => <Button {...props}>add</Button>;'
      )
    ).toHaveLength(0);
  });

  it('ignores type-only imports, which mount nothing', () => {
    expect(
      verify(
        "import type { Button } from 'wheel/components';\nexport const A = () => <Button>x</Button>;"
      )
    ).toHaveLength(0);
  });

  it('respects the written escape hatch', () => {
    expect(
      verify(
        '// wheel-component-role: the shell mounts exactly one, and `Input` says what it is.\n' +
          "import { Input } from 'wheel/components';\nexport const A = () => <Input />;"
      )
    ).toHaveLength(0);
  });
});
