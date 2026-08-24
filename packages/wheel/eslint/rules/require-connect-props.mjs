/**
 * WHY THIS RULE EXISTS (props that never reach the registry):
 *
 * The debug tree shows each component's props, and it gets them from the
 * ONE door props already pass through: the connection call. So a component
 * that has props but hands its connection an empty object is invisible in
 * exactly the place you'd look:
 *
 *   export function TodoRow(props: { todo: Todo }) {
 *     const state = connectTodoRow({});      // ❌ tree shows NO props
 *     const state = connectTodoRow(props);   // ✅ tree shows { todo: … }
 *
 * `connectTodoRow({})` is tempting whenever the declaration doesn't happen
 * to READ props — the call still typechecks, the component still works, and
 * nothing complains. The cost shows up much later: debugging a row that
 * renders the wrong todo, you open the tree and it claims the component was
 * passed nothing at all, which reads as "this component takes no props"
 * rather than "the props were dropped on the way in".
 *
 * Passing props is free — `connect()` already accepts them (it needs them
 * for per-instance names), and forwarding costs nothing at runtime.
 *
 * Only fires when the component actually declares a props parameter.
 * A component that takes none correctly calls `connectThing({})`.
 *
 * Escape hatch: `// wheel-connect-props: <reason>`.
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "a component with props passes them to its connection so the debug tree can show them"
    },
    messages: {
      droppedProps:
        "'{{name}}' takes props but calls its connection with `{{actual}}`, so the debug tree shows it as having no props. Pass them through: `{{connection}}(props)` — connect() already accepts props and forwarding is free."
    },
    schema: []
  },
  create(context) {
    const filename = context.filename;
    if (/\.test\.(ts|tsx)$/.test(filename) || /\.states\.tsx$/.test(filename)) {
      return {};
    }
    if (/wheel-connect-props:/.test(context.sourceCode.getText())) return {};

    const stack = [];

    function componentInfo(node) {
      let name = null;
      if (node.type === 'FunctionDeclaration' && node.id && /^[A-Z]/.test(node.id.name)) {
        name = node.id.name;
      } else if (
        (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') &&
        node.parent?.type === 'VariableDeclarator' &&
        node.parent.id?.type === 'Identifier' &&
        /^[A-Z]/.test(node.parent.id.name)
      ) {
        name = node.parent.id.name;
      }
      if (!name) return null;
      const parameter = node.params[0];
      // Only a NAMED props parameter can be forwarded. A destructured one
      // (`{ id }`) has no identifier to pass and is its own anti-pattern in
      // Solid (it breaks reactivity), so leave that to review.
      return { name, propsName: parameter?.type === 'Identifier' ? parameter.name : null };
    }

    return {
      ':function'(node) {
        stack.push(componentInfo(node));
      },
      ':function:exit'() {
        stack.pop();
      },
      CallExpression(node) {
        const frame = stack[stack.length - 1];
        if (!frame?.propsName) return;
        if (node.callee?.type !== 'Identifier' || !/^connect[A-Z]/.test(node.callee.name)) return;
        const [argument] = node.arguments;
        if (argument?.type === 'Identifier' && argument.name === frame.propsName) return;
        // Anything that isn't the props identifier drops them: `{}`, a
        // rebuilt literal, a subset.
        context.report({
          node: argument ?? node,
          messageId: 'droppedProps',
          data: {
            name: frame.name,
            connection: node.callee.name,
            actual: context.sourceCode.getText(argument ?? node).slice(0, 30)
          }
        });
      }
    };
  }
};
