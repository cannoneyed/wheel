/**
 * WHY THIS RULE EXISTS (dead imports rot quietly until a delete breaks):
 *
 * An import nobody uses is invisible. It reads as "this file depends on X", so
 * the next person keeps X alive when deleting it — the whole point of the 011
 * cleanup was tracing which exports were truly dead, and a stale import is a
 * false "still used" signal that defeats that tracing. It also survives
 * refactors that removed the last real use, leaving a line that lies about the
 * file's dependencies.
 *
 *   import { toSqlText } from '../core/sql';   // ❌ nothing below references it
 *   const source = handler.sql!(params);        //    the real code moved on
 *
 *   import type { SqlFragment } from '../core/sql';  // ✅ actually used below
 *   const s: SqlFragment = ...
 *
 * The pain shows up nowhere at runtime — it shows up months later when someone
 * tries to delete `toSqlText` and greps for callers, finds this import, and
 * wastes time proving it's dead. This rule makes "dead import" a lint error the
 * moment it appears.
 *
 * Scope: imports only (value AND `import type`). We deliberately do NOT flag
 * unused locals/params — that is a separate, noisier concern; keeping this rule
 * to imports keeps its false-positive surface at zero. Type references count as
 * uses: the @typescript-eslint parser's scope manager records them, so an
 * `import type` consumed only in a type annotation is correctly seen as used.
 *
 * One extra case the scope manager can't see on its own: Solid `use:` directives.
 * `<div use:componentRoot>` references the imported `componentRoot` binding, but
 * the JSX attribute is a namespaced name, not an identifier the scope manager
 * links to the import — TypeScript counts it as a use (that's why the import is
 * required), so we must too, or we'd false-flag every directive import as dead.
 * We collect the directive names used in `use:` attributes and treat matching
 * imports as used.
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'no unused imports — every imported binding must be referenced (value or type); dead imports lie about a file’s dependencies'
    },
    messages: {
      unused: "'{{name}}' is imported but never used. Remove the import — a dead import falsely signals a dependency and blocks safe deletion of what it names."
    },
    schema: []
  },
  create(context) {
    /** Binding names referenced by a Solid `use:<name>` JSX directive. */
    const usedDirectives = new Set();
    /** Imports are checked at Program:exit, after all `use:` attributes are seen. */
    const importNodes = [];
    return {
      JSXAttribute(node) {
        const name = node.name;
        if (name.type === 'JSXNamespacedName' && name.namespace.name === 'use') {
          usedDirectives.add(name.name.name);
        }
      },
      ImportDeclaration(node) {
        // Side-effect imports (`import './x'`) declare no bindings — never dead.
        if (node.specifiers.length > 0) importNodes.push(node);
      },
      'Program:exit'() {
        for (const node of importNodes) {
          for (const variable of context.sourceCode.getDeclaredVariables(node)) {
            // A binding used anywhere — as a value or in a type position — has
            // at least one reference recorded by the scope manager.
            if (variable.references.length > 0) continue;
            // Solid `use:<name>` directives reference the import without a
            // scope-manager reference; TypeScript counts them, so we do too.
            if (usedDirectives.has(variable.name)) continue;
            const def = variable.defs[0];
            const reportNode = def ? def.node : node;
            context.report({
              node: reportNode,
              messageId: 'unused',
              data: { name: variable.name }
            });
          }
        }
      }
    };
  }
};
