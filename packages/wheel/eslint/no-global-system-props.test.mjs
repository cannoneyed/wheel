/**
 * wheel/no-global-system-props: global components take no settings as
 * props. See the rule's own header for the story it comes from.
 */
import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import wheel from './index.mjs';

const linter = new Linter({ configType: 'flat' });

function verify(code, filename = 'packages/tracker/src/main.tsx') {
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
        rules: { 'wheel/no-global-system-props': 'error' }
      }
    ],
    { filename }
  );
}

const kit = "import { CommandPaletteSystem, ToastSystem } from 'wheel/kit';\n";
const debug = "import { WheelApp } from 'wheel/debug';\n";

describe('no-global-system-props', () => {
  it('flags a setting passed to a global system', () => {
    const messages = verify(`${kit}const a = <CommandPaletteSystem openKeys={['mod+shift+p']} />;`);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('wheel.config.ts');
  });

  it('flags spread props, and allows only the listed view render props', () => {
    expect(verify(`${kit}const a = <ToastSystem {...options} />;`)).toHaveLength(1);
    expect(verify(`${kit}const a = <ToastSystem renderToast={(t) => t.text} />;`)).toEqual([]);
    expect(verify(`${kit}const a = <ToastSystem position="top" />;`)).toHaveLength(1);
  });

  it('lets the bootstrap root take client, config, and scopeId, and nothing else', () => {
    expect(verify(`${debug}const a = <WheelApp client={client} config={wheelConfig} scopeId="app"><App /></WheelApp>;`)).toEqual([]);
    expect(verify(`${debug}const a = <WheelApp client={client} debugControl="controlled"><App /></WheelApp>;`)).toHaveLength(1);
  });

  it('allows data-wheel-role and bare mounts', () => {
    expect(verify(`${kit}const a = <><CommandPaletteSystem /><ToastSystem data-wheel-role="toasts" /></>;`)).toEqual([]);
  });

  it('follows renamed imports, and ignores same-named local components', () => {
    expect(verify(`import { CommandPaletteSystem as Palette } from 'wheel/kit';\nconst a = <Palette openKeys={k} />;`)).toHaveLength(1);
    expect(verify('function CommandPaletteSystem(props) { return null; }\nconst a = <CommandPaletteSystem openKeys={k} />;')).toEqual([]);
  });

  it("leaves Wheel's own kernel source alone, but not its tests", () => {
    const code = "import { InspectorSystem } from './inspector';\nconst a = <InspectorSystem hideResults />;";
    expect(verify(code, 'packages/wheel/src/debug/wheel-app.tsx')).toEqual([]);
    expect(verify(code, 'packages/wheel/src/debug/inspector.test.tsx')).toHaveLength(1);
  });
});
