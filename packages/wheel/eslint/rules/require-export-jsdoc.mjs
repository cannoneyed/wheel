/**
 * AGENTS.md rule 2: every exported symbol carries a JSDoc comment explaining
 * what it is and WHY it exists. Pure re-exports are exempt (document at the
 * definition).
 */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'exported symbols must have a JSDoc comment explaining what and why' },
    messages: {
      missing: 'Exported symbol "{{name}}" has no JSDoc comment. Explain what it is and why it exists (AGENTS.md rule 2).'
    },
    schema: []
  },
  create(context) {
    const source = context.sourceCode;

    function hasJsdoc(node) {
      const comments = source.getCommentsBefore(node);
      return comments.some((comment) => comment.type === 'Block' && comment.value.startsWith('*'));
    }

    function nameOf(declaration) {
      if (!declaration) return 'unknown';
      if (declaration.id?.name) return declaration.id.name;
      if (declaration.declarations?.[0]?.id?.name) return declaration.declarations[0].id.name;
      return 'unknown';
    }

    return {
      ExportNamedDeclaration(node) {
        if (!node.declaration) {
          return; // re-export: `export { x } from './y'` / `export { x }`
        }
        if (!hasJsdoc(node)) {
          context.report({ node, messageId: 'missing', data: { name: nameOf(node.declaration) } });
        }
      },
      ExportDefaultDeclaration(node) {
        if (!hasJsdoc(node)) {
          context.report({ node, messageId: 'missing', data: { name: 'default' } });
        }
      }
    };
  }
};
