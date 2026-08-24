/**
 * ONE connect function per component, and no hooks-style naming.
 *
 * Enforces three things:
 * 1. The result of `connect(...)` is bound to a `connect`-prefixed name
 *    (`connectTodoList`) — never `useTodoList`. The `connect` prefix is what
 *    makes the data-dependency tree greppable and statically analyzable.
 * 2. A component calls at most ONE connection function. Two connections in
 *    one component means the component is doing two components' jobs.
 * 3. The connection call is the FIRST statement of the component, so the
 *    manifest is always in the same place in every file.
 */
const CONNECT_NAME = /^connect[A-Z]/;
const COMPONENT_NAME = /^[A-Z]/;

function isConnectionCall(node) {
  return node.type === 'CallExpression' && node.callee?.type === 'Identifier' && CONNECT_NAME.test(node.callee.name);
}

function componentNameOf(fn) {
  if (fn.id?.name && COMPONENT_NAME.test(fn.id.name)) return fn.id.name;
  const parent = fn.parent;
  if (parent?.type === 'VariableDeclarator' && parent.id?.name && COMPONENT_NAME.test(parent.id.name)) {
    return parent.id.name;
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'one connect function per component, connect-prefixed, called first' },
    messages: {
      badName:
        "The result of connect() must be bound to a `connect`-prefixed name (e.g. `connect{{suggestion}}`), not '{{name}}'. No hooks-style naming.",
      multipleConnections:
        "Component '{{component}}' calls more than one connection function. One component, one connect — split the component.",
      notFirst:
        "Component '{{component}}' must call its connection function as its FIRST statement, so the data manifest is always in the same place."
    },
    schema: []
  },
  create(context) {
    const componentStack = [];

    function enterFunction(fn) {
      const name = componentNameOf(fn);
      componentStack.push(name ? { name, fn, connections: [] } : null);
    }

    function exitFunction() {
      const frame = componentStack.pop();
      if (!frame || frame.connections.length === 0) return;
      if (frame.connections.length > 1) {
        for (const call of frame.connections.slice(1)) {
          context.report({ node: call, messageId: 'multipleConnections', data: { component: frame.name } });
        }
      }
      const first = frame.connections[0];
      const body = frame.fn.body;
      if (body?.type !== 'BlockStatement') return; // expression-bodied arrow: nothing to order
      const firstStatement = body.body[0];
      // The call must live inside the first statement (usually
      // `const state = connectX(props);`).
      let current = first;
      let containing = null;
      while (current && current !== frame.fn) {
        if (current.parent === body) {
          containing = current;
          break;
        }
        current = current.parent;
      }
      if (containing !== firstStatement) {
        context.report({ node: first, messageId: 'notFirst', data: { component: frame.name } });
      }
    }

    return {
      FunctionDeclaration: enterFunction,
      FunctionExpression: enterFunction,
      ArrowFunctionExpression: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      'FunctionExpression:exit': exitFunction,
      'ArrowFunctionExpression:exit': exitFunction,

      CallExpression(node) {
        // Naming: `const X = connect('Name', ...)` must bind a connect-prefixed id.
        if (node.callee?.type === 'Identifier' && node.callee.name === 'connect') {
          const parent = node.parent;
          if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') {
            if (!CONNECT_NAME.test(parent.id.name)) {
              const literal = node.arguments[0];
              const suggestion = literal?.type === 'Literal' ? String(literal.value) : 'ComponentName';
              context.report({
                node: parent.id,
                messageId: 'badName',
                data: { name: parent.id.name, suggestion }
              });
            }
          }
          return;
        }
        // Usage: record connection calls inside the nearest component frame.
        if (isConnectionCall(node)) {
          for (let i = componentStack.length - 1; i >= 0; i -= 1) {
            const frame = componentStack[i];
            if (frame) {
              frame.connections.push(node);
              break;
            }
            // A non-component function between the call and the component
            // (callback, helper) — the call is not a top-level connection.
            break;
          }
        }
      }
    };
  }
};
