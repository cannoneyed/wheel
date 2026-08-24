/**
 * WHY THIS RULE EXISTS (the directive that compiles to nothing):
 *
 * `use:something` is a Solid COMPILER feature, and the compiler only wires it
 * up on native elements. Put it on a component and it is dropped — silently,
 * with no warning at build time and no error at runtime:
 *
 *   <button use:contextMenu={{ ... }}>⋯</button>   // ✅ right-click menu works
 *   <Button use:contextMenu={{ ... }}>⋯</Button>   // ❌ compiles to nothing
 *
 * Nothing about the second line looks wrong. The page renders, the button
 * clicks, the types pass. The only symptom is a feature that stopped
 * happening — and the place you notice is wherever the behavior was supposed
 * to appear, which is usually not this file.
 *
 * This bites hardest during exactly the change that motivated the rule:
 * swapping hand-rolled `<button>` and `<input>` for the shipped
 * `wheel/components` versions. The swap is a find-and-replace, and any
 * `use:contextMenu`, `use:componentRoot`, or `use:viewRoot` riding on those
 * tags goes quiet — taking a context menu, or a component's registration in
 * the debug tree, with it.
 *
 * The fix is always one of two things:
 *
 *   1. Keep the native element where the directive IS the behavior.
 *   2. Wrap the component in the native element the directive needs.
 *
 * There is no valid third option, so this rule has no pragma escape: a
 * directive on a component is never what the author meant.
 */

/** Directive props are `use:*` — Solid's own namespace for them. */
function directiveName(attribute) {
  if (attribute.type !== 'JSXAttribute') return null;
  const name = attribute.name;
  if (name.type === 'JSXNamespacedName' && name.namespace.name === 'use') {
    return `use:${name.name.name}`;
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Solid applies use: directives to native elements only — on a component the directive is silently dropped'
    },
    messages: {
      directiveOnComponent:
        "`{{directive}}` is on <{{component}}>, a component — Solid drops directives on anything but a native element, so this line does nothing. Keep the native element, or wrap <{{component}}> in one."
    },
    schema: []
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        // A component is a capitalized name or a member expression (Foo.Bar).
        const el = node.name;
        const isComponent =
          (el.type === 'JSXIdentifier' && /^[A-Z]/.test(el.name)) ||
          el.type === 'JSXMemberExpression';
        if (!isComponent) return;

        const componentText = context.sourceCode.getText(el);
        for (const attribute of node.attributes) {
          const directive = directiveName(attribute);
          if (directive) {
            context.report({
              node: attribute,
              messageId: 'directiveOnComponent',
              data: { directive, component: componentText }
            });
          }
        }
      }
    };
  }
};
