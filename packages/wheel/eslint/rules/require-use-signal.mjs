/**
 * WHY THIS RULE EXISTS (invisible local state):
 *
 * Component-local state is legal in wheel — an open flag, a hover, an input
 * draft. But a plain `createSignal` is an anonymous closure: nothing knows
 * it exists, so the debug tree shows a component whose behavior is driven
 * by `isOpen` and says nothing at all about `isOpen`.
 *
 *   const [draft, setDraft] = createSignal('');          // ❌ invisible
 *   const [draft, setDraft] = useSignal('', 'draft');    // ✅ shows in the tree
 *
 * `useSignal` (wheel/core) is a drop-in — same tuple, same options — that
 * records the NAME against the mounted component, so the tree renders a
 * `local` group with the live value beside the component's props and
 * connect state. The name is required: an unnamed signal would just trade
 * one anonymous closure for another.
 *
 * The pain of NOT doing this shows up during debugging, far from the
 * declaration: you can see the component misbehaving and the panel can't
 * tell you what it currently believes.
 *
 * Scope: `createSignal` called inside a COMPONENT (a capitalized function).
 * Services use `this.atom`, and module-level or helper-function signals are
 * not component state, so both are left alone. Escape hatch for the genuine
 * exceptions (a signal built in a loop, machinery that has no useful name):
 * `// wheel-raw-signal: <reason>`.
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'component-local state uses useSignal(initial, name) from wheel/core so the debug tree can show it'
    },
    messages: {
      rawSignal:
        "`createSignal` inside a component is invisible to the debug tree. Use `useSignal(initial, '<name>')` from wheel/core (drop-in: same tuple, same options) so the component's local state shows up beside its props and state, or explain with `// wheel-raw-signal: <reason>`."
    },
    schema: []
  },
  create(context) {
    const filename = context.filename;
    if (/\.test\.(ts|tsx)$/.test(filename) || /\.states\.tsx$/.test(filename)) {
      return {};
    }
    const source = context.sourceCode.getText();
    if (/wheel-raw-signal:/.test(source)) return {};
    // wheel's own useSignal necessarily calls createSignal.
    if (/packages\/wheel\/src\/core\/local-state\.ts$/.test(filename.replace(/\\/g, '/'))) return {};

    /** Local names bound to solid-js's createSignal. */
    const signalNames = new Set();
    /** Depth of capitalized (component) functions we're inside. */
    const componentStack = [];

    function isComponent(node) {
      if (node.type === 'FunctionDeclaration' && node.id && /^[A-Z]/.test(node.id.name)) return true;
      return (
        (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') &&
        node.parent?.type === 'VariableDeclarator' &&
        node.parent.id?.type === 'Identifier' &&
        /^[A-Z]/.test(node.parent.id.name)
      );
    }

    const enter = (node) => componentStack.push(isComponent(node));
    const exit = () => componentStack.pop();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'solid-js') return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && specifier.imported?.name === 'createSignal') {
            signalNames.add(specifier.local.name);
          }
        }
      },
      FunctionDeclaration: enter,
      'FunctionDeclaration:exit': exit,
      ArrowFunctionExpression: enter,
      'ArrowFunctionExpression:exit': exit,
      FunctionExpression: enter,
      'FunctionExpression:exit': exit,
      CallExpression(node) {
        if (node.callee?.type !== 'Identifier' || !signalNames.has(node.callee.name)) return;
        // Only inside a component: a signal in a service, a module-level
        // signal, or one in a plain helper is not component-local state.
        if (!componentStack.some(Boolean)) return;
        context.report({ node, messageId: 'rawSignal' });
      }
    };
  }
};
