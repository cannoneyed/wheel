/**
 * WHY THIS RULE EXISTS (a modal is a behavior system, not a styled box):
 *
 * A native container with `role="dialog"` or `aria-modal="true"` can look like
 * a modal while omitting focus trapping, focus restoration, Escape handling,
 * and accessible labeling. Wheel's shared Dialog owns those behaviors.
 *
 *   <div role="dialog" aria-modal="true" />  // ❌ homemade modal
 *   <Dialog.Root><Dialog.Popup /></Dialog.Root> // ✅ shared behavior
 *
 * Scope: native JSX elements with a static `role="dialog"` or
 * `role="alertdialog"`, or a statically true `aria-modal`. The rule recognizes
 * JSX shorthand, boolean expressions, and the string "true". It cannot see a
 * visual overlay or semantics hidden behind a custom component or spread.
 *
 * A low-level editor or integration boundary can carry an adjacent exception:
 * `// wheel-native-dialog: <reason>`.
 */
const ESCAPE = /wheel-native-dialog:\s+\S.{19,}/s;
const ESCAPE_LINE_DISTANCE = 5;

function staticValue(attribute) {
  if (attribute.value == null) return true;
  if (attribute.value.type === 'Literal') return attribute.value.value;
  const expression = attribute.value.type === 'JSXExpressionContainer' && attribute.value.expression;
  return expression?.type === 'Literal' ? expression.value : undefined;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'use Wheel Dialog instead of a native container with static dialog semantics'
    },
    messages: {
      nativeDialog:
        'This native <{{tag}}> declares modal or dialog semantics but does not provide Wheel Dialog behavior. Use Dialog from `wheel/components/dialog` for focus, Escape, and accessibility, or add an adjacent `// wheel-native-dialog: <reason>` for a low-level boundary.'
    },
    schema: []
  },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();
    return {
      JSXOpeningElement(node) {
        if (node.name?.type !== 'JSXIdentifier' || !/^[a-z]/.test(node.name.name)) return;
        const declaresDialog = (node.attributes ?? []).some((attribute) => {
          if (attribute.type !== 'JSXAttribute' || attribute.name?.type !== 'JSXIdentifier') {
            return false;
          }
          const value = staticValue(attribute);
          return (
            (attribute.name.name === 'role' && (value === 'dialog' || value === 'alertdialog')) ||
            (attribute.name.name === 'aria-modal' && (value === true || value === 'true'))
          );
        });
        if (!declaresDialog) return;
        const line = node.loc.start.line;
        const excused = source
          .getAllComments()
          .some(
            (comment) =>
              ESCAPE.test(comment.value) &&
              comment.loc.end.line <= line &&
              line - comment.loc.end.line <= ESCAPE_LINE_DISTANCE
          );
        if (excused) return;
        context.report({ node: node.name, messageId: 'nativeDialog', data: { tag: node.name.name } });
      }
    };
  }
};
