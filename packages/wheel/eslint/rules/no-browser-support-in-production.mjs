/**
 * WHY THIS RULE EXISTS
 *
 * Browser support can restart servers and inject faults. Importing it from a
 * production server or Worker would ship those controls with the app.
 *
 *   ❌ import { faults } from './browser/support/test-server';
 *   ✅ import { bindings } from './server/modules';
 *
 * Production entries may share domain bindings with tests. They may never
 * import the test harness itself.
 */

export default {
  meta: {
    type: 'problem',
    docs: { description: 'production entries may not import browser test support' },
    messages: {
      browserSupport: 'Production entries may not import browser support or test controllers.'
    },
    schema: []
  },
  create(context) {
    const check = (node) => {
      const source = node.source;
      if (typeof source?.value === 'string' && /(^|\/)browser(\/|$)/.test(source.value)) {
        context.report({ node, messageId: 'browserSupport' });
      }
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression(node) {
        if (typeof node.source?.value === 'string' && /(^|\/)browser(\/|$)/.test(node.source.value)) {
          context.report({ node, messageId: 'browserSupport' });
        }
      }
    };
  }
};
