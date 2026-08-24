/**
 * WHY THIS RULE EXISTS
 *
 * Wheel's determinism doctrine: `src/` never touches real time, timers, or
 * randomness directly. Shared application behavior takes Clock / Defer /
 * RandomBytes by injection. `core/runtime-defaults.ts` binds those contracts
 * to the platform. Accessible component machinery uses one smaller browser
 * seam at `components/base-utils/runtime.ts`. Those seams make World tests,
 * simulation seeds, component fake timers, and
 * replay fixtures reproducible: a raw `setTimeout` or `Math.random` buried
 * in sync code produces schedules no seed can replay, and the failure shows
 * up nowhere near the call — it surfaces as a flaky simulation somewhere
 * else entirely. This bit twice before the seam existed (toast pacing, the
 * pg-adapter pin probe).
 *
 *   ❌ setTimeout(retry, backoff)                 // untestable, unseedable
 *   ❌ const jitter = Math.random() * 0.25;       // no seed can replay this
 *   ✅ options.defer.schedule(backoff, retry)     // injected; tests control time
 *   ✅ retryForever(task, { defer, random01, … }) // the shared backoff loop
 *
 * The constraints suite (constraints.test.ts) already enforces this in CI by
 * scanning file text; this rule is the same doctrine at EDIT time, in the
 * editor, before a suite ever runs — and unlike the text scan it understands
 * code, so `globalThis.setTimeout(...)` and aliased member calls are caught
 * identically.
 *
 * SCOPE: every production `src/` file. The rule skips
 * the two exact runtime seam files and test files.
 * TSX may opt into native presentation timing one call at a time:
 *
 *   // wheel-view-timing: keep the transient success chip visible long enough to read
 *   setTimeout(hideChip, 600);
 *
 * ESCAPE HATCH: none expected — new real-time needs belong in
 * runtime-defaults. If a genuine exception ever appears, suppress the line
 * with `// eslint-disable-next-line wheel/no-raw-timers` and a written reason.
 */
const BANNED_GLOBALS = new Set(['setTimeout', 'setInterval']);

export default {
  meta: {
    type: 'problem',
    docs: { description: 'no raw timers/time/randomness in src/ — use the injected Clock/Defer/RandomBytes seam (runtime-defaults)' },
    messages: {
      rawTimer:
        'Raw {{name}} in src/ breaks the determinism doctrine (seeds cannot replay real timers). Take a Defer by injection (default systemDefer) or use retryForever — see core/runtime-defaults.ts.',
      rawTime:
        'Raw {{name}} in src/ breaks the determinism doctrine (fixed clocks and seeds cannot control it). Take a Clock/RandomBytes/random01 by injection — see core/runtime-defaults.ts.'
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowViewTimingReasons: { type: 'boolean' }
        },
        additionalProperties: false
      }
    ]
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const normalizedFilename = filename.replace(/\\/g, '/');
    if (
      /\.test\.[jt]sx?$/.test(filename) ||
      normalizedFilename.endsWith('/core/runtime-defaults.ts') ||
      normalizedFilename.endsWith('/components/base-utils/runtime.ts')
    ) {
      return {};
    }
    const allowViewTimingReasons =
      context.options[0]?.allowViewTimingReasons === true && /\.tsx$/.test(filename);

    function hasViewTimingReason(node) {
      if (!allowViewTimingReasons) return false;
      let anchor = node;
      while (
        anchor.parent &&
        anchor.parent.loc?.start.line === node.loc?.start.line
      ) {
        anchor = anchor.parent;
      }
      const previous = context.sourceCode.getCommentsBefore(anchor).at(-1);
      if (!previous || previous.loc?.end.line !== node.loc?.start.line - 1) return false;
      return /^\s*wheel-view-timing:\s+\S.{19,}$/s.test(previous.value);
    }

    function report(node, messageId, name) {
      if (hasViewTimingReason(node)) return;
      context.report({ node, messageId, data: { name } });
    }

    /** The called name for `setTimeout(...)` and `globalThis.setTimeout(...)` alike. */
    function calledGlobalName(callee) {
      if (callee.type === 'Identifier') return callee.name;
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        (callee.object.name === 'globalThis' || callee.object.name === 'window' || callee.object.name === 'self') &&
        callee.property.type === 'Identifier'
      ) {
        return callee.property.name;
      }
      return null;
    }

    return {
      CallExpression(node) {
        const name = calledGlobalName(node.callee);
        if (name && BANNED_GLOBALS.has(name)) {
          report(node, 'rawTimer', name);
          return;
        }
        // Date.now() / Math.random()
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          callee.property.type === 'Identifier' &&
          ((callee.object.name === 'Date' && callee.property.name === 'now') ||
            (callee.object.name === 'Math' && callee.property.name === 'random'))
        ) {
          report(node, 'rawTime', `${callee.object.name}.${callee.property.name}()`);
        }
      },
      NewExpression(node) {
        // `new Date()` (zero args) reads the real clock; `new Date(ms)` merely
        // formats an injected timestamp and stays legal.
        if (node.callee.type === 'Identifier' && node.callee.name === 'Date' && node.arguments.length === 0) {
          report(node, 'rawTime', 'new Date()');
        }
      }
    };
  }
};
