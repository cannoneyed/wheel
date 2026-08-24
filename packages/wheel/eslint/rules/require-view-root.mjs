/**
 * WHY THIS RULE EXISTS (the invisible dumb-component hole):
 *
 * 017 made the component tree UNIVERSAL: agents and the debug panel see
 * every mounted component — not just the connected layer. Connected
 * components register through connect(); dumb components register through
 * `use:viewRoot` (a dev-only no-op in production):
 *
 *   export function Avatar(props) {
 *     return <img use:viewRoot={'Avatar'} src={props.url} />;   // ✅ in the tree
 *   }
 *   export function Avatar(props) {
 *     return <img src={props.url} />;                           // ❌ invisible
 *   }
 *
 * Forgetting the directive produces no error anywhere — the app renders
 * fine, and the hole is discovered only when an agent walks the component
 * tree and a whole visual layer is missing. This rule turns that silent hole
 * into a build error, mirroring `require-component-root` for the connected
 * layer.
 *
 * Auto-exempt (no report, no pragma needed):
 * - connected components (they call their `connect<Name>` function;
 *   `require-component-root` owns them),
 * - components that render NO host element (pure composition: providers,
 *   HOCs, fragments of other components) — there is no DOM to mark and no
 *   visual identity to select,
 * - test files.
 *
 * Everything else either marks a root or explains itself with
 * `// wheel-view-root: <reason>` (file-level, greppable).
 *
 * The directive's string must equal the component's name — the registry id
 * IS that string, and a drifted name makes `find('Avatar')` miss.
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'dumb components mark their root element with use:viewRoot={<name>} so the component tree stays complete (or explain why not)'
    },
    messages: {
      missingViewRoot:
        "Component '{{name}}' renders DOM but never registers — add `use:viewRoot={'{{name}}'}` to its root element, or explain the exemption with `// wheel-view-root: <reason>`.",
      nameMismatch:
        "use:viewRoot names '{{given}}' but the enclosing component is '{{name}}' — the string IS the registry id, keep them identical."
    },
    schema: []
  },
  create(context) {
    if (/\.test\.(ts|tsx)$/.test(context.filename) || /\.test-d\.tsx?$/.test(context.filename)) {
      return {};
    }
    const source = context.sourceCode.getText();
    const filePragma = /wheel-view-root:/.test(source);

    /** Stack of enclosing capitalized component functions. */
    const stack = [];

    function componentName(node) {
      if (node.type === 'FunctionDeclaration' && node.id && /^[A-Z]/.test(node.id.name)) {
        return node.id.name;
      }
      if (
        (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') &&
        node.parent?.type === 'VariableDeclarator' &&
        node.parent.id?.type === 'Identifier' &&
        /^[A-Z]/.test(node.parent.id.name)
      ) {
        return node.parent.id.name;
      }
      return null;
    }

    function enter(node) {
      const name = componentName(node);
      stack.push(
        name
          ? { name, node, hostElement: false, viewRoot: false, connected: false }
          : null
      );
    }

    function exit() {
      const frame = stack.pop();
      if (!frame || !frame.hostElement || frame.connected || frame.viewRoot || filePragma) return;
      context.report({ node: frame.node, messageId: 'missingViewRoot', data: { name: frame.name } });
    }

    function current() {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]) return stack[i];
      }
      return null;
    }

    return {
      FunctionDeclaration: enter,
      'FunctionDeclaration:exit': exit,
      ArrowFunctionExpression: enter,
      'ArrowFunctionExpression:exit': exit,
      FunctionExpression: enter,
      'FunctionExpression:exit': exit,
      JSXOpeningElement(node) {
        const frame = current();
        if (!frame) return;
        // Host elements are lowercase identifiers (`div`, `img`); component
        // elements are capitalized or member expressions — only host DOM
        // creates the obligation to register.
        if (node.name?.type === 'JSXIdentifier' && /^[a-z]/.test(node.name.name)) {
          frame.hostElement = true;
        }
      },
      JSXAttribute(node) {
        const frame = current();
        if (!frame) return;
        const name = node.name;
        if (name?.type !== 'JSXNamespacedName' || name.namespace?.name !== 'use') return;
        if (name.name?.name === 'componentRoot') {
          // A componentRoot inside a non-connected function still means the
          // DOM is claimed (multi-component files attach through the owner
          // chain) — do not double-demand a viewRoot.
          frame.connected = true;
        }
        if (name.name?.name === 'viewRoot') {
          frame.viewRoot = true;
          // Accept both spellings: `use:viewRoot={'Name'}` and the grouped
          // object form `use:viewRoot={{ name: 'Name', group: 'framework' }}`.
          const value = node.value;
          let expression = value?.type === 'JSXExpressionContainer' ? value.expression : value;
          if (expression?.type === 'ObjectExpression') {
            expression = expression.properties.find(
              (property) =>
                property.type === 'Property' &&
                !property.computed &&
                property.key?.type === 'Identifier' &&
                property.key.name === 'name'
            )?.value;
          }
          const literal = expression?.type === 'Literal' ? expression.value : null;
          if (typeof literal === 'string' && literal !== frame.name) {
            context.report({
              node,
              messageId: 'nameMismatch',
              data: { given: literal, name: frame.name }
            });
          }
        }
      },
      CallExpression(node) {
        const frame = current();
        if (!frame) return;
        // Calling `connect<Name>(props)` (or any connection function named by
        // the `connect` prefix convention, enforced by single-connect) marks
        // this component as connected — require-component-root owns it.
        if (node.callee?.type === 'Identifier' && /^connect($|[A-Z0-9_])/.test(node.callee.name)) {
          frame.connected = true;
        }
      }
    };
  }
};
