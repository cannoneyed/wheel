/**
 * WHY THIS RULE EXISTS
 *
 * The sync client and transport used to track "are we shut down" with
 * scattered booleans (`let stopped = false` in the transport, per-loop
 * checks elsewhere). A boolean can only be POLLED — so every async loop
 * re-checked it at whatever points its author remembered, and the points
 * nobody remembered kept running after close(): the old transport's
 * backoff sleep ignored teardown until its timer fired, and an in-flight
 * network read outlived close() entirely. The pain never shows at the flag —
 * it shows as ghost requests and state mutations AFTER teardown, in tests
 * that flake and browsers that reconnect from closed tabs.
 *
 * The 011 async-discipline refactor replaced them with ONE AbortController
 * per lifecycle: close() calls abort(), the signal rides on every fetch
 * (in-flight work dies immediately, not at the next poll), and helpers like
 * retryForever observe it mid-backoff. This rule keeps the old pattern from
 * growing back.
 *
 *   ❌ let stopped = false;  …  close() { stopped = true; }
 *   ❌ private closed = false;
 *   ✅ private readonly lifecycle = new AbortController();
 *      …every loop/fetch observes lifecycle.signal; close() { this.lifecycle.abort(); }
 *
 * SCOPE: `src/sync/client/` (wired in eslint.config.mjs), where the
 * AbortSignal discipline now holds throughout. The server engine's own
 * `closed` latches (engine.ts) predate the discipline and are outside this
 * rule's files until they migrate — widening the glob then is the whole
 * migration checklist. Matched by NAME (stopped/closed/aborted/cancelled/
 * canceled/destroyed/disposed initialized to a boolean literal): connection
 * STATE like `connected` or reentrancy latches like `flushing` are
 * legitimately booleans and are not matched.
 *
 * ESCAPE HATCH: a genuine non-teardown boolean that happens to need one of
 * these names — suppress the line with
 * `// eslint-disable-next-line wheel/no-teardown-booleans` and a reason,
 * or (better) pick a name that says what the state IS rather than that
 * something stopped.
 */
const TEARDOWN_NAMES = new Set(['stopped', 'closed', 'aborted', 'cancelled', 'canceled', 'destroyed', 'disposed']);

function isBooleanLiteral(node) {
  return node && node.type === 'Literal' && typeof node.value === 'boolean';
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'teardown state uses one AbortController/AbortSignal, never a hand-rolled stopped/closed boolean' },
    messages: {
      teardownBoolean:
        '"{{name}}" looks like a hand-rolled teardown flag — booleans can only be polled, so in-flight work outlives close(). Use one AbortController: abort() on close and observe .signal in every loop (see websocket-transport.ts and client.ts).'
    },
    schema: []
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (/\.test\.[jt]sx?$/.test(filename)) {
      return {};
    }
    return {
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && TEARDOWN_NAMES.has(node.id.name) && isBooleanLiteral(node.init)) {
          context.report({ node, messageId: 'teardownBoolean', data: { name: node.id.name } });
        }
      },
      PropertyDefinition(node) {
        if (node.key.type === 'Identifier' && TEARDOWN_NAMES.has(node.key.name) && isBooleanLiteral(node.value)) {
          context.report({ node, messageId: 'teardownBoolean', data: { name: node.key.name } });
        }
      }
    };
  }
};
