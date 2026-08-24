/**
 * WHY THIS RULE EXISTS (effects are the one escape hatch — make them explain themselves):
 *
 * `createEffect` / `createRenderEffect` / `onMount` are where reactive code
 * reaches OUT to imperative stuff the framework can't see — a DOM listener, a
 * floating-ui position, a third-party editor, focus restoration. Those are
 * exactly the lines a future reader (or agent) can't derive from the code
 * around them, so each one must carry a sentence saying what boundary it owns.
 *
 * ❌  createEffect(() => { el.addEventListener(...) })   // no comment: why?
 * ✅  // listener boundary: rebind focusin/focusout when the binding changes
 *     createRenderEffect(() => { ... })
 *
 * WHAT THIS RULE CHECKS — AND WHAT IT DELIBERATELY DOES NOT:
 *
 * It checks two things only: (1) a contiguous comment sits immediately above
 * the call, and (2) that comment has real substance (≥ 20 characters of text).
 * It does NOT grade the CONTENT — no keyword allowlist ('tiptap', 'listener',
 * …), no scoring. An earlier version tried to and it backfired: the allowlist
 * was app-specific (kernel effects that said "position the panel" failed while
 * anything mentioning "history" passed), and a keyword is not a reason. The
 * honest tradeoff: a lint rule can force a human-written sentence to EXIST; it
 * cannot verify the sentence is a good one. That last mile is a review concern,
 * not a machine one. Presence + minimum length is the most this rule can
 * enforce without lying about what it measures.
 */
const EFFECT_NAMES = new Set(['createEffect', 'createRenderEffect', 'onMount']);

/** Minimum characters of comment text to count as a real explanation (not `// x`). */
const MIN_SUBSTANCE = 20;

function isEffectCall(node) {
  if (node.callee?.type === 'Identifier') {
    return EFFECT_NAMES.has(node.callee.name);
  }
  return node.callee?.type === 'MemberExpression' && EFFECT_NAMES.has(node.callee.property?.name);
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'require a substantive explanatory comment before every createEffect/createRenderEffect/onMount call' },
    messages: {
      missingReason: 'Every createEffect/createRenderEffect/onMount needs an immediately preceding comment (≥ 20 chars) explaining its imperative boundary.'
    },
    schema: []
  },
  create(context) {
    const source = context.sourceCode;
    return {
      CallExpression(node) {
        if (!isEffectCall(node)) {
          return;
        }
        const comments = source.getCommentsBefore(node);
        const previous = comments.at(-1);
        // The comment must sit on the line directly above the call.
        if (!previous || previous.loc?.end.line !== node.loc?.start.line - 1) {
          context.report({ node, messageId: 'missingReason' });
          return;
        }
        // Walk upward through the contiguous comment block (a multi-line reason
        // spread over several `//` lines counts as one explanation).
        const contiguous = [previous];
        for (let index = comments.length - 2; index >= 0; index -= 1) {
          const comment = comments[index];
          if (comment.loc?.end.line !== contiguous[0].loc?.start.line - 1) {
            break;
          }
          contiguous.unshift(comment);
        }
        const text = contiguous.map((comment) => comment.value).join(' ').trim();
        if (text.length < MIN_SUBSTANCE) {
          context.report({ node, messageId: 'missingReason' });
        }
      }
    };
  }
};
