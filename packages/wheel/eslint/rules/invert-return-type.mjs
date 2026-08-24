/**
 * WHY THIS RULE EXISTS (the undo self-reference trap):
 *
 * Most mutations undo by running THEMSELVES with the old values — so their
 * `invert` mentions the mutation being defined:
 *
 *   const rename = mutation({
 *     invert: (reader, args) => ({ mutation: rename, args: { ...old } })
 *   });                                      // ^^^^^^ mentions itself
 *
 * TypeScript can't infer a type from a definition that references itself —
 * it SILENTLY gives up and types the whole mutation `any`. No error here;
 * instead, type checking quietly disappears in every file that imports the
 * mutation (server handlers see `unknown` args, or worse, nothing complains
 * at all).
 *
 * One annotation breaks the loop, so this rule requires it on every invert:
 *
 *   invert: (reader, args): InverseSpec | null => ({ ... })   // ✅
 *
 * The same trap exists whether `invert` is written as an arrow OR a plain
 * `function () {}` expression, so this rule checks both forms.
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'every mutation invert must annotate its return type (breaks the silent any from self-reference)' },
    messages: {
      missingAnnotation:
        "Annotate this invert's return type — `invert: (reader, args): InverseSpec | null =>` — or a self-reference silently turns the whole mutation into `any` and type checking disappears in every importing file."
    },
    schema: []
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'mutation') return;
        const options = node.arguments[0];
        if (options?.type !== 'ObjectExpression') return;
        const invert = options.properties.find(
          (prop) => prop.type === 'Property' && prop.key?.name === 'invert'
        );
        if (
          !invert ||
          (invert.value?.type !== 'ArrowFunctionExpression' &&
            invert.value?.type !== 'FunctionExpression')
        )
          return;
        if (!invert.value.returnType) {
          context.report({ node: invert.value, messageId: 'missingAnnotation' });
        }
      }
    };
  }
};
