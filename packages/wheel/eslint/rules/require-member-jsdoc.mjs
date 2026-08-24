/**
 * AGENTS.md rule 2 (extended): every public member of an exported class —
 * fields, methods, getters — carries a JSDoc comment, same what+why bar as
 * exports. Private members (`private` / `#`) and constructors are exempt.
 */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'public class members must have a JSDoc comment' },
    messages: {
      missing: 'Public member "{{name}}" of exported class has no JSDoc comment (AGENTS.md rule 2).'
    },
    schema: []
  },
  create(context) {
    const source = context.sourceCode;

    function isExportedClass(node) {
      let current = node;
      while (current) {
        if (current.type === 'ExportNamedDeclaration' || current.type === 'ExportDefaultDeclaration') {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    function check(node) {
      if (node.accessibility === 'private' || node.key?.type === 'PrivateIdentifier') return;
      if (node.kind === 'constructor') return;
      const cls = node.parent?.parent;
      if (!cls || (cls.type !== 'ClassDeclaration' && cls.type !== 'ClassExpression')) return;
      if (!isExportedClass(cls)) return;
      const comments = source.getCommentsBefore(node);
      const hasJsdoc = comments.some((comment) => comment.type === 'Block' && comment.value.startsWith('*'));
      if (!hasJsdoc) {
        context.report({ node, messageId: 'missing', data: { name: node.key?.name ?? '?' } });
      }
    }

    return {
      PropertyDefinition: check,
      MethodDefinition: check
    };
  }
};
