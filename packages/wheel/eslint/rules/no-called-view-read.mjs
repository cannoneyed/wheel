/**
 * WHY THIS RULE EXISTS
 *
 * A `view()` read must be DEFERRED — an accessor view() calls later, inside the
 * component's render, so Solid tracks the read where it happens. Calling the
 * accessor in the reads object reads it ONCE at connect time and freezes the
 * result: the component connects a dead snapshot that never updates when the
 * data changes.
 *
 *   ❌ view({ count: svc.count() })         // frozen number — never re-renders
 *   ✅ view({ count: svc.count })            // the accessor; view() calls it lazily
 *   ✅ view({ vm: () => svc.issueVm(id) })   // a keyed read, deferred in a thunk
 *
 * view() itself throws at runtime when the called value is a primitive, null,
 * or an array (a snapshot it can prove is wrong). But a call that returns an
 * OBJECT — `view({ vm: svc.issueVm(id) })` — is indistinguishable at runtime
 * from a live view object passed through, so the frozen-object bug slips past
 * the runtime net. This rule closes that gap statically: a direct call in the
 * reads object is the mistake in every form, object-returning included.
 *
 * SCOPE: only the FIRST argument of a bare `view(...)` call (the reads object).
 * `this.view(...)` (SyncService's liveQuery accessor) is a MemberExpression and
 * is never matched. Actions — the second argument — are bound functions and are
 * not checked here.
 *
 * ESCAPE HATCH: the rare legitimate case is a factory that RETURNS an accessor
 * (`view({ x: makeReader() })`, where makeReader() returns `() => value`). That
 * pattern does not appear in this codebase and is against the "reads are service
 * fields" convention; if it is ever genuinely needed, suppress the one line with
 * `// eslint-disable-next-line wheel/no-called-view-read` and a reason.
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'view() reads must be accessors or thunks, never eagerly-called values' },
    messages: {
      calledRead:
        'view() read "{{name}}" calls the accessor — that reads it ONCE and freezes the result. Pass the accessor (`{{name}}: svc.{{name}}`) or defer the call (`{{name}}: () => svc.{{name}}(id)`).'
    },
    schema: []
  },
  create(context) {
    function readName(property) {
      if (property.key?.type === 'Identifier') return property.key.name;
      if (property.key?.type === 'Literal') return String(property.key.value);
      return '?';
    }

    return {
      CallExpression(node) {
        // Bare `view(...)` only — `this.view(...)` is SyncService's liveQuery.
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'view') return;
        const reads = node.arguments[0];
        if (reads?.type !== 'ObjectExpression') return;
        for (const property of reads.properties) {
          if (property.type !== 'Property') continue;
          if (property.value?.type === 'CallExpression') {
            context.report({
              node: property.value,
              messageId: 'calledRead',
              data: { name: readName(property) }
            });
          }
        }
      }
    };
  }
};
