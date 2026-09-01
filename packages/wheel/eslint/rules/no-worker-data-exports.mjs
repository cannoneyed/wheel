/**
 * WHY THIS RULE EXISTS
 *
 * Workerd treats every runtime named export from a Worker entry as a handler.
 * A string export passed TypeScript and `wrangler deploy --dry-run`, then made
 * `wrangler dev` refuse to boot the Tracker Worker.
 *
 *   ❌ export const APPLICATION_VERSION = 1;
 *   ✅ const APPLICATION_VERSION = 1;
 *   ✅ export class Workspace extends DurableObject {}
 *
 * Re-exported runtime values are also ambiguous at the entry boundary. Import
 * constants privately, and declare handler functions or Durable Object classes
 * in the entry file.
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Cloudflare Worker entries may not export runtime data'
    },
    messages: {
      dataExport:
        'Workerd treats named runtime exports as entry points. Keep data private and export only handler functions or Durable Object classes.'
    },
    schema: []
  },
  create(context) {
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration?.type === 'VariableDeclaration' || node.source) {
          context.report({ node, messageId: 'dataExport' });
        }
      }
    };
  }
};
