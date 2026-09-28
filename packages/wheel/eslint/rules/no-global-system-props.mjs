/**
 * WHY THIS RULE EXISTS (config hiding in the component tree)
 *
 * Some Wheel components are GLOBAL: mounted once at the root, they own an
 * app-wide behavior. `<CommandPaletteSystem/>` decides which keys open the
 * palette for the whole app; `<WheelApp/>` decides how the debug chrome
 * opens. A prop on one of them is app config in disguise:
 *
 * - It hides in whatever JSX file happens to mount the system, so "which
 *   keys open the palette here?" means searching the tree for the mount.
 * - Two mounts can disagree (a test harness, an embedded demo), and nothing
 *   says which one is the app's real setting.
 * - A test, a service, or an agent cannot read it without rendering.
 *
 * Wheel's answer is one typed file, `src/wheel.config.ts`, passed to the
 * root once (`<WheelApp config={wheelConfig}>`) and read through
 * `WheelConfigService`. This rule keeps the props from coming back:
 *
 *   ❌ <CommandPaletteSystem openKeys={['mod+shift+p']} />
 *   ❌ <WheelApp client={client} debugControl="controlled">
 *   ❌ <WheelAnnotate enabled />
 *   ✅ // src/wheel.config.ts
 *      export default defineWheelConfig({
 *        commandPalette: { openKeyCommand: 'mod+shift+p' },
 *        debug: { control: 'controlled' },
 *        annotate: { enabled: true }
 *      });
 *   ✅ <WheelApp client={client} config={wheelConfig}>
 *
 * Allowed: the bootstrap root's identity props (`client`, `config`,
 * `scopeId`, and children on `WheelApp`/`WheelProvider`),
 * `data-wheel-role` everywhere, and a short allowlist of VIEW render props
 * (`renderToast` on `ToastSystem`). The line is behavior vs. looks: config
 * holds app-wide behavior (which keys, which mode, where to save); a render
 * function only changes how something is drawn, is not JSON, and belongs
 * with the JSX that draws it. Add to the allowlist only a prop that is a
 * pure view customization, and say so next to it.
 *
 * Scope: every JSX use of these names, except inside Wheel's own
 * non-test kernel source, which composes its systems internally (WheelApp
 * mounts InspectorSystem with its results panel hidden). Instance-level
 * components (Button, Frame.Column) are not global and keep their props.
 *
 * Escape hatch: `// eslint-disable-next-line wheel/no-global-system-props -- <reason>`.
 */

/** Global components and the props each may take. */
const GLOBAL_COMPONENTS = new Map([
  ['KeyboardSystem', []],
  ['DialogSystem', []],
  ['ContextMenuSystem', []],
  ['CommandPaletteSystem', []],
  // renderToast: view customization (how a toast looks), not behavior.
  ['ToastSystem', ['renderToast']],
  ['InspectorSystem', []],
  ['WheelDebugPanel', []],
  ['WheelAnnotate', []],
  ['WheelApp', ['client', 'config', 'scopeId', 'children']],
  ['WheelProvider', ['client', 'config', 'children']]
]);

/** Allowed on every global component. */
const ALWAYS_ALLOWED = new Set(['data-wheel-role']);

/** Whether this file is Wheel's own kernel source (not a test). */
function isKernelSource(filename) {
  const path = filename.replaceAll('\\', '/');
  return (
    /(^|\/)packages\/wheel\/src\//.test(path) &&
    !/\.(test|test-d|states)\.[jt]sx?$/.test(path)
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Global Wheel components (mounted once) take no settings as props; app-wide settings live in src/wheel.config.ts.'
    },
    schema: [],
    messages: {
      prop:
        '<{{name}}> is a global component: `{{prop}}` is app config, not a prop. Put it in src/wheel.config.ts (defineWheelConfig) and pass that to the root once: <WheelApp config={wheelConfig}>.',
      spread:
        '<{{name}}> is a global component: spread props would pass app config through the tree. Put settings in src/wheel.config.ts (defineWheelConfig).'
    }
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isKernelSource(filename)) return {};

    // Local names bound to a global component by an import.
    const globals = new Map();

    return {
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const imported = specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
          if (GLOBAL_COMPONENTS.has(imported)) globals.set(specifier.local.name, imported);
        }
      },
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        const name = globals.get(node.name.name);
        if (!name) return;
        const allowed = GLOBAL_COMPONENTS.get(name);
        for (const attribute of node.attributes) {
          if (attribute.type === 'JSXSpreadAttribute') {
            context.report({ node: attribute, messageId: 'spread', data: { name } });
            continue;
          }
          const prop =
            attribute.name.type === 'JSXNamespacedName'
              ? `${attribute.name.namespace.name}:${attribute.name.name.name}`
              : attribute.name.name;
          if (ALWAYS_ALLOWED.has(prop) || allowed.includes(prop)) continue;
          context.report({ node: attribute, messageId: 'prop', data: { name, prop } });
        }
      }
    };
  }
};
