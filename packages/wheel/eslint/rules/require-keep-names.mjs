/**
 * WHY THIS RULE EXISTS
 *
 * Service identity IS the class name: the debug panel's state tree, the
 * component tree's service labels, DebugMeta.serviceName, and the agent
 * bridge's `actService('BoardService', …)` lookups all read
 * `constructor.name`. Production minification renames classes to `So`/`hs`,
 * and every one of those surfaces goes illegible at once.
 *
 * `wheelDevTools()` (wheel/vite) fixes this by setting esbuild's
 * `keepNames`, which preserves `.name` through minification at negligible
 * size cost. It also enables Wheel's dev-only surfaces during Vite serve and
 * checks direct `file:` dependencies for stale package output. The demos,
 * tracker, and playground configs applied it — the
 * website and docs configs did not, so every production docs/website build
 * shipped embedded live demos whose debug panel showed minified service
 * names. Nothing failed; the names were just gone. That is exactly the kind
 * of silent drift a rule exists to stop.
 *
 * ❌ // vite.config.ts
 *    export default defineConfig({
 *      resolve: { alias: [{ find: /^wheel\/core$/, replacement: here('../wheel/src/core/index.ts') }] },
 *      plugins: [solid()]
 *    });
 *
 * ✅ // vite.config.ts
 *    import { wheelDevTools } from '../wheel/src/vite/index';
 *    export default defineConfig({
 *      resolve: { alias: [{ find: /^wheel\/core$/, replacement: here('../wheel/src/core/index.ts') }] },
 *      plugins: [solid(), wheelDevTools()]
 *    });
 *
 * Scope: files named vite.config.ts whose nearest package depends on wheel,
 * or that alias wheel from source (a replacement path containing
 * `wheel/src/`). vitest configs are exempt. Escape: a
 * `// wheel-keep-names: <reason, 20+ chars>` comment anywhere in the file
 * for a host that deliberately opts out.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, parse, resolve } from 'node:path';

const PRAGMA = /^\s*wheel-keep-names:\s*\S.{19,}/;

function packageUsesWheel(filename) {
  let directory = dirname(resolve(filename));
  const root = parse(directory).root;
  while (true) {
    const manifestPath = resolve(directory, 'package.json');
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      return [
        manifest.dependencies,
        manifest.devDependencies,
        manifest.optionalDependencies,
        manifest.peerDependencies
      ].some((dependencies) => dependencies && Object.hasOwn(dependencies, 'wheel'));
    }
    if (directory === root) return false;
    directory = dirname(directory);
  }
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A Wheel vite config must apply wheelDevTools() for dev mode, package checks, and stable service names'
    },
    schema: []
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!filename.endsWith('vite.config.ts') || filename.endsWith('vitest.config.ts')) {
      return {};
    }
    let usesWheel = packageUsesWheel(filename);
    let appliesDevTools = false;
    return {
      Literal(node) {
        if (typeof node.value === 'string' && node.value.includes('wheel/src/')) {
          usesWheel = true;
        }
      },
      TemplateElement(node) {
        if (node.value.raw.includes('wheel/src/')) {
          usesWheel = true;
        }
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'wheelDevTools') {
          appliesDevTools = true;
        }
      },
      'Program:exit'(node) {
        if (!usesWheel || appliesDevTools) return;
        const pragma = context.sourceCode
          .getAllComments()
          .some((comment) => PRAGMA.test(comment.value));
        if (pragma) return;
        context.report({
          node,
          message:
            'This Wheel Vite config never applies wheelDevTools(). Without it, a prebuilt ' +
            'file dependency loses dev mode and can stay stale; minification can also ' +
            'rename every service. Add wheelDevTools() to plugins, ' +
            'or explain the opt-out in a `// wheel-keep-names: <reason>` comment.'
        });
      }
    };
  }
};
