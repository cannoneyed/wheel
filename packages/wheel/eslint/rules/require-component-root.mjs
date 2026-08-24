/**
 * WHY THIS RULE EXISTS (the invisible-component hole):
 *
 * Wheel's promise is that EVERY connected component is inspectable: draw a
 * rectangle over it, get its name and live state. That only works if the
 * component marked its root element:
 *
 *   <li use:componentRoot class={styles.row}>   // ✅ selectable, inspectable
 *   <li class={styles.row}>                     // ❌ invisible to selection
 *
 * Forgetting the directive produces no error anywhere — the component
 * renders fine and the hole is discovered only when someone drags a
 * rectangle over it and gets nothing back. This rule turns that silent
 * hole into a build error: any file that calls connect() must put
 * `use:componentRoot` on at least one element, or say why it can't:
 *
 *   // wheel-component-root: headless — renders nothing, drives toasts
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'connected components mark their root element with use:componentRoot (or explain why not)' },
    messages: {
      missingRoot:
        "This file connects a component but never marks a root element — add `use:componentRoot` to the component's root JSX element, or explain the exemption with `// wheel-component-root: <reason>` (e.g. headless components that render no DOM)."
    },
    schema: []
  },
  create(context) {
    // Test files are exempt: their inline connect() fixtures exercise the
    // kernel, they aren't part of any app's inspectable surface.
    if (/\.test\.(ts|tsx)$/.test(context.filename)) {
      return {};
    }
    let connectCall = null;
    let hasComponentRoot = false;
    return {
      CallExpression(node) {
        if (node.callee?.type === 'Identifier' && node.callee.name === 'connect' && !connectCall) {
          connectCall = node;
        }
      },
      // The compiled-away directive appears in the AST as a JSX attribute
      // named `use:componentRoot`.
      JSXAttribute(node) {
        const name = node.name;
        if (name?.type === 'JSXNamespacedName' && name.namespace?.name === 'use' && name.name?.name === 'componentRoot') {
          hasComponentRoot = true;
        }
      },
      'Program:exit'() {
        if (!connectCall || hasComponentRoot) return;
        const source = context.sourceCode.getText();
        if (/wheel-component-root:/.test(source)) return;
        context.report({ node: connectCall, messageId: 'missingRoot' });
      }
    };
  }
};
