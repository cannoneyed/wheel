/**
 * WHY THIS RULE EXISTS (the component you can't see until production):
 *
 * A connect shape is a complete renderable state, and a colocated
 * `<component>.states.tsx` file enumerates the states that matter — so a
 * human browses them in the playground sidebar and an agent screenshots any
 * one by URL (`#/states/ToastSystem/empty`). Without the file, the only way
 * to SEE a component's edge states (empty, loading, error, overflowing) is
 * to force the whole app into them — which is why edge states ship broken.
 *
 *   toast.tsx  + toast.states.tsx   // ✅ every kind visible in isolation
 *   toast.tsx  (alone)              // ❌ the warn toast is first seen by a user
 *
 * Scope, deliberately: packages/wheel/src/kit — the library's own visual
 * components set the standard first (the 017 decision: prove the feel in
 * kit, then consider widening to app packages). Components whose states
 * aren't stubbable shapes (geometry primitives, headless systems) explain
 * themselves with `// wheel-component-states: <reason>`.
 */
import { existsSync } from 'node:fs';

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'wheel/kit components with a connect() declaration ship a sibling *.states.tsx enumerating their renderable states (or explain why not)'
    },
    messages: {
      missingStates:
        "This kit component connects but has no sibling '{{expected}}' — enumerate its renderable states (see core/states.tsx), or explain the exemption with `// wheel-component-states: <reason>`."
    },
    schema: []
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, '/');
    if (
      !/packages\/wheel\/src\/kit\//.test(filename) ||
      /\.test\.[jt]sx?$/.test(filename) ||
      /\.states\.tsx$/.test(filename)
    ) {
      return {};
    }
    let connectCall = null;
    return {
      CallExpression(node) {
        if (node.callee?.type === 'Identifier' && node.callee.name === 'connect' && !connectCall) {
          connectCall = node;
        }
      },
      'Program:exit'() {
        if (!connectCall) return;
        if (/wheel-component-states:/.test(context.sourceCode.getText())) return;
        const statesPath = filename.replace(/\.tsx?$/, '.states.tsx');
        if (existsSync(statesPath)) return;
        context.report({
          node: connectCall,
          messageId: 'missingStates',
          data: { expected: statesPath.split('/').pop() }
        });
      }
    };
  }
};
