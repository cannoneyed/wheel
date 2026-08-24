/**
 * WHY THIS RULE EXISTS (half the tree can't show its inputs):
 *
 * The component tree shows each component's props — what its parent handed
 * it. Connected components get that for free, because `connect()` is called
 * WITH props and wheel can read them. A dumb component has no such door:
 * `use:viewRoot` only sees what the directive is given.
 *
 *   <img use:viewRoot={'Avatar'} src={props.url} />                     // ❌ props invisible
 *   <img use:viewRoot={{ name: 'Avatar', props }} src={props.url} />    // ✅ props in the tree
 *
 * Without this the tree is inconsistent in a way that is easy to misread: a
 * view component shows NO props, which looks like "this component takes no
 * props" rather than "wheel was never told". Debugging a wrong avatar then
 * means reading the parent's source to find out what it passed.
 *
 * Only fires when the component actually declares a props parameter — a
 * component that takes none has nothing to pass, and the plain string form
 * stays correct and idiomatic for it.
 *
 * Escape hatch: `// wheel-view-props: <reason>` (e.g. props containing
 * something genuinely not worth projecting).
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'a view component that takes props passes them through use:viewRoot so the debug tree can show them'
    },
    messages: {
      missingProps:
        "'{{name}}' takes props but its `use:viewRoot` doesn't pass them, so the component tree shows it as having none. Use the object form: `use:viewRoot={{ name: '{{name}}', props }}` — or explain with `// wheel-view-props: <reason>`."
    },
    schema: []
  },
  create(context) {
    const filename = context.filename;
    if (/\.test\.(ts|tsx)$/.test(filename) || /\.states\.tsx$/.test(filename)) {
      return {};
    }
    if (/wheel-view-props:/.test(context.sourceCode.getText())) return {};

    /** Stack of enclosing capitalized components, with what we've seen inside. */
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
      stack.push(name ? { name, node, takesProps: node.params.length > 0, directive: null } : null);
    }

    function exit() {
      const frame = stack.pop();
      if (!frame || !frame.takesProps || !frame.directive) return;
      const value = frame.directive.value;
      const expression = value?.type === 'JSXExpressionContainer' ? value.expression : null;
      // The string form carries no props by construction; the object form
      // must actually include a `props` entry.
      const passesProps =
        expression?.type === 'ObjectExpression' &&
        expression.properties.some(
          (property) =>
            (property.type === 'Property' &&
              !property.computed &&
              property.key?.type === 'Identifier' &&
              property.key.name === 'props') ||
            property.type === 'SpreadElement'
        );
      if (!passesProps) {
        context.report({ node: frame.directive, messageId: 'missingProps', data: { name: frame.name } });
      }
    }

    function current() {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index]) return stack[index];
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
      JSXAttribute(node) {
        const frame = current();
        if (!frame) return;
        const name = node.name;
        if (
          name?.type === 'JSXNamespacedName' &&
          name.namespace?.name === 'use' &&
          name.name?.name === 'viewRoot'
        ) {
          frame.directive = node;
        }
      }
    };
  }
};
