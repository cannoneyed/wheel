/**
 * WHY THIS RULE EXISTS (the second live app tree):
 *
 * `isWheelDevMode()` reads a module boolean. It is not reactive. A Solid
 * `<Show>` cannot observe a later change to it, but Show still reads both its
 * selected branch and fallback inside a memo. WheelApp once put the host
 * application's whole tree in those branches. If that memo ran again, it
 * could create another app with separate services and body portals:
 *
 *   <Show when={isWheelDevMode()} fallback={props.children}> // ❌ memo boundary
 *     <DevShell>{props.children}</DevShell>
 *   </Show>
 *
 *   isWheelDevMode() ? <DevShell>{props.children}</DevShell> : props.children // ✅ fixed branch
 *
 * Scope is deliberately narrow. Other Show conditions can be signals. This
 * rule only rejects a Show whose condition directly calls isWheelDevMode().
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'the fixed dev-mode flag uses a plain conditional, not a Show memo'
    },
    messages: {
      staticDevMode:
        '`isWheelDevMode()` is not reactive, so `<Show>` adds a memo without observing any change. Use a plain conditional expression instead; Show reads its selected branch inside that memo.'
    },
    schema: []
  },
  create(context) {
    const showNames = new Set();
    const devModeNames = new Set();

    return {
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          if (specifier.imported?.name === 'Show') showNames.add(specifier.local.name);
          if (specifier.imported?.name === 'isWheelDevMode') devModeNames.add(specifier.local.name);
        }
      },
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier' || !showNames.has(node.name.name)) return;
        const when = node.attributes.find(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            attribute.name.type === 'JSXIdentifier' &&
            attribute.name.name === 'when'
        );
        const expression = when?.value?.type === 'JSXExpressionContainer' ? when.value.expression : null;
        if (
          expression?.type !== 'CallExpression' ||
          expression.arguments.length !== 0 ||
          expression.callee.type !== 'Identifier' ||
          !devModeNames.has(expression.callee.name)
        ) {
          return;
        }
        context.report({ node: when, messageId: 'staticDevMode' });
      }
    };
  }
};
