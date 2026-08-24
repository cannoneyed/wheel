/**
 * WHY THIS RULE EXISTS
 *
 * Two related landmines around derivation arguments, one rule.
 *
 * 1. `computed(fn)` is a PLAIN derivation — `fn` takes no arguments at all.
 *    The parameterized form was split out into `computedFor` (011 Part 4.1),
 *    so a parameter on a computed callback is always a migration mistake:
 *
 *      ❌ readonly vm = this.computed((issueId: string) => …);
 *      ✅ readonly vm = this.computedFor((issueId: string) => …);
 *
 *    TypeScript rejects this too, but the tsc error ("not assignable to
 *    parameter of type '() => T'") doesn't say WHY or name the fix — this
 *    rule does.
 *
 * 2. `computedFor` memoizes per KEY, and the key is hashed with
 *    canonicalParams — which throws the moment `undefined` appears inside the
 *    key tuple ("undefined inside an array is ambiguous — use null"). So a
 *    computedFor with an optional key is a runtime landmine:
 *
 *      ❌ readonly targets = this.computedFor((issueId?: string) => …);
 *         this.targets(props.maybeId);   // maybeId === undefined → THROWS
 *
 *    The call site looks innocent — nothing about `targets(props.maybeId)`
 *    says "crashes when the id is absent" — and it works fine right up until
 *    the first undefined flows through (hit for real in app code).
 *
 *    The fix is one of two shapes, both explicit:
 *
 *      ✅ readonly targets = this.computedFor((issueId: string | null) => …);
 *         this.targets(props.maybeId ?? null);        // null is canonical data
 *      ✅ readonly targets = (issueId?: string) => …; // plain function — no
 *         // key cache, so optionality is harmless
 *
 *    Default values don't save you either: `(a = 5)` still receives the RAW
 *    key — an explicit undefined throws before the default applies. So this
 *    rule flags optional params (`a?`), `undefined` in a param's type, and
 *    defaulted params inside `this.computedFor(...)` callbacks.
 *
 *    `clientReadFor` (SyncService) is checked identically: it delegates
 *    straight to `computedFor`, so the same undefined-key landmine applies.
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'computed() takes no args; computedFor() keys must be required and never undefined' },
    messages: {
      computedTakesNoArgs:
        'computed() is a plain derivation — its callback takes no parameters. For a per-key derivation use `this.computedFor((key) => …)` (parameter "{{name}}" here).',
      optionalArg:
        'computedFor() key "{{name}}" can be undefined — canonicalParams throws on undefined inside a key tuple. Use `| null` (and pass `?? null`) or make this a plain function instead of a computedFor.'
    },
    schema: []
  },
  create(context) {
    function typeIncludesUndefined(annotation) {
      if (!annotation) return false;
      const node = annotation.typeAnnotation ?? annotation;
      if (node.type === 'TSUndefinedKeyword') return true;
      if (node.type === 'TSUnionType') {
        return node.types.some((member) => typeIncludesUndefined(member));
      }
      return false;
    }

    function checkParam(param) {
      if (param.type === 'AssignmentPattern') {
        return { bad: true, name: param.left?.name ?? '?' };
      }
      if (param.type === 'Identifier') {
        if (param.optional || typeIncludesUndefined(param.typeAnnotation)) {
          return { bad: true, name: param.name };
        }
      }
      return { bad: false };
    }

    function paramName(param) {
      if (param.type === 'AssignmentPattern') return param.left?.name ?? '?';
      if (param.type === 'Identifier') return param.name;
      return '?';
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        const isThisCall =
          callee?.type === 'MemberExpression' &&
          callee.object?.type === 'ThisExpression' &&
          callee.property?.type === 'Identifier';
        if (!isThisCall) return;
        const method = callee.property.name;
        if (method !== 'computed' && method !== 'computedFor' && method !== 'clientReadFor') return;
        const callback = node.arguments[0];
        if (!callback || (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression')) {
          return;
        }
        if (method === 'computed') {
          // Plain derivation: ANY parameter means the author wanted computedFor.
          for (const param of callback.params) {
            context.report({ node: param, messageId: 'computedTakesNoArgs', data: { name: paramName(param) } });
          }
          return;
        }
        for (const param of callback.params) {
          const verdict = checkParam(param);
          if (verdict.bad) {
            context.report({ node: param, messageId: 'optionalArg', data: { name: verdict.name } });
          }
        }
      }
    };
  }
};
