/**
 * WHY THIS RULE EXISTS (a minifier renames your services, and the name IS the label):
 *
 * Wheel reads a service's identity off its CLASS NAME. The state tree's rows,
 * the `serviceName` on every atom and action, `actService('BoardService', …)`,
 * and an annotation timeline all print whatever `BoardService.name` says.
 *
 * A minifier renames that class to `iu`. So a production build without special
 * handling turns the whole debug story illegible:
 *
 *   BoardService.toggleCell("3-7")   ✅ what you want to read
 *   iu.toggleCell("3-7")             ❌ what a minified build says
 *
 * The old fix was esbuild's `keepNames`, which `wheelDevTools()` sets. It
 * works, and it costs — it appends a `__name()` call to EVERY function and
 * class in the app, measured at 11.7 KB gzipped on Axle, to rescue a few dozen
 * strings that matter.
 *
 * Declaring the name is the cheap version. One line per service, ~30 bytes,
 * and it survives any minifier because it is a string literal:
 *
 *   class BoardService extends Service {         // ❌ name depends on the compiler
 *     readonly cells = this.atom([], 'cells');
 *   }
 *
 *   class BoardService extends Service {         // ✅ name is data
 *     static override serviceName = 'BoardService';
 *     readonly cells = this.atom([], 'cells');
 *   }
 *
 * The rule requires the declaration on EVERY service class and requires it to
 * match the class it sits in — a copy-pasted `serviceName` pointing at the
 * wrong class is worse than none, because the state tree would then lie with
 * confidence. It is auto-fixable: `eslint --fix` writes the line.
 *
 * Statics inherit, which is exactly why "every class declares its own" is the
 * rule rather than "declare it somewhere": `class Child extends Parent {}`
 * would otherwise silently report itself as `Parent`.
 */

/** The `static serviceName` member of a class, if it declares its own. */
function ownServiceName(node) {
  return node.body.body.find(
    (member) =>
      member.type === 'PropertyDefinition' &&
      member.static &&
      member.key?.type === 'Identifier' &&
      member.key.name === 'serviceName'
  );
}

export default {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'every Service subclass declares `static override serviceName` matching its class name, so identity survives minification'
    },
    messages: {
      missing:
        "Service '{{name}}' has no `static override serviceName`. A minifier renames the class and the state tree, actService lookups, and annotation timelines all go illegible. Add `static override serviceName = '{{name}}';` (eslint --fix writes it).",
      mismatch:
        "Service '{{name}}' declares serviceName '{{declared}}'. A name that disagrees with its class makes the state tree lie with confidence — it must be '{{name}}'.",
      dynamic:
        "Service '{{name}}' computes its serviceName. It has to be a plain string literal, or a minifier can rename whatever it reads."
    },
    schema: []
  },
  create(context) {
    const serviceClassNames = new Set();

    function isServiceClass(node) {
      const parent = node.superClass;
      return (
        parent?.type === 'Identifier' &&
        (parent.name === 'Service' || parent.name === 'SyncService' || serviceClassNames.has(parent.name))
      );
    }

    function checkClass(node) {
      if (!isServiceClass(node)) return;
      const name = node.id?.name;
      // An anonymous service expression has no name to agree with.
      if (!name) return;
      serviceClassNames.add(name);

      const declared = ownServiceName(node);
      if (!declared) {
        context.report({
          node: node.id ?? node,
          messageId: 'missing',
          data: { name },
          fix(fixer) {
            const body = node.body;
            const indent = ' '.repeat((node.loc?.start.column ?? 0) + 2);
            return fixer.insertTextAfter(
              context.sourceCode.getFirstToken(body),
              `\n${indent}/** Identity that survives minification (see require-service-name). */\n${indent}static override serviceName = '${name}';\n`
            );
          }
        });
        return;
      }

      const value = declared.value;
      if (value?.type !== 'Literal' || typeof value.value !== 'string') {
        context.report({ node: declared, messageId: 'dynamic', data: { name } });
        return;
      }
      if (value.value !== name) {
        context.report({
          node: declared,
          messageId: 'mismatch',
          data: { name, declared: value.value },
          fix: (fixer) => fixer.replaceText(value, `'${name}'`)
        });
      }
    }

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass
    };
  }
};
