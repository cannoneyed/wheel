/**
 * SMALL FILES: at most ONE connect() declaration per module.
 *
 * A file with several connected components is several components' worth of
 * manifests, styles, and concerns in one place — the file-level version of a
 * super component. One connected component per file keeps every manifest
 * findable by filename and every component individually sandboxable.
 * Applies everywhere, kernel included.
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'at most one connect() declaration per file' },
    messages: {
      tooMany:
        'This file declares {{count}} connected components; the limit is ONE per file. Move each connect + its component into its own module (small files!).'
    },
    schema: []
  },
  create(context) {
    const declarations = [];
    return {
      CallExpression(node) {
        if (node.callee?.type === 'Identifier' && node.callee.name === 'connect') {
          declarations.push(node);
        }
      },
      'Program:exit'() {
        if (declarations.length > 1) {
          for (const extra of declarations.slice(1)) {
            context.report({
              node: extra,
              messageId: 'tooMany',
              data: { count: String(declarations.length) }
            });
          }
        }
      }
    };
  }
};
