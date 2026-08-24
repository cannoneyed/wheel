/**
 * AGENTS.md rule 3: components connect to services ONLY through connect().
 * Calling useService/useLiveClient/useServiceContext — or reading Wheel's raw
 * Solid contexts — destroys the audit surface (the connect declaration is the
 * component's complete data manifest). Service helper calls are allowed
 * inside connect(); raw contexts are never an app API.
 */
const FORBIDDEN = new Set([
  'useService',
  'useWheelClient',
  'useServiceContext',
  'useWheelContext',
  'useRuntimeService',
  'useObservableValue',
  'useAtomValue'
]);

export default {
  meta: {
    type: 'problem',
    docs: { description: 'components access services only via connect()' },
    messages: {
      useConnect:
        '{{name}} in component code bypasses the connect() audit surface. Declare the dependency in a connect(…) and read the injected value (AGENTS.md rule 3).',
      rawContext:
        'Direct useContext({{name}}) bypasses connect() and exposes the service container. WheelContext and StubContext are framework-internal.'
    },
    schema: []
  },
  create(context) {
    const contextNames = new Set(['WheelContext', 'StubContext']);
    const useContextNames = new Set(['useContext']);
    const solidNamespaces = new Set();

    return {
      ImportDeclaration(node) {
        const source = String(node.source.value);
        for (const specifier of node.specifiers) {
          if (source === 'solid-js') {
            if (
              specifier.type === 'ImportSpecifier' &&
              specifier.imported.type === 'Identifier' &&
              specifier.imported.name === 'useContext'
            ) {
              useContextNames.add(specifier.local.name);
            } else if (specifier.type === 'ImportNamespaceSpecifier') {
              solidNamespaces.add(specifier.local.name);
            }
          }
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            (specifier.imported.name === 'WheelContext' || specifier.imported.name === 'StubContext')
          ) {
            contextNames.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        const isUseContext =
          (callee.type === 'Identifier' && useContextNames.has(callee.name)) ||
          (callee.type === 'MemberExpression' &&
            !callee.computed &&
            callee.object.type === 'Identifier' &&
            solidNamespaces.has(callee.object.name) &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'useContext');
        const rawContext = node.arguments[0];
        if (
          isUseContext &&
          rawContext?.type === 'Identifier' &&
          contextNames.has(rawContext.name)
        ) {
          context.report({
            node,
            messageId: 'rawContext',
            data: { name: rawContext.name }
          });
          return;
        }
        const name = node.callee?.name;
        if (!name || !FORBIDDEN.has(name)) return;
        // Walk up: inside a connect(...) declaration callback is the one legal home.
        let current = node.parent;
        while (current) {
          if (current.type === 'CallExpression' && current.callee?.name === 'connect') {
            return;
          }
          current = current.parent;
        }
        context.report({ node, messageId: 'useConnect', data: { name } });
      }
    };
  }
};
