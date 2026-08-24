/**
 * WHY THIS RULE EXISTS (the invisible log line):
 *
 * 017's error story promises that EVERYTHING that goes wrong is captured in
 * one buffer — referenced by id in the debug panel, read by agents through
 * `window.__wheel.errors()`, and thrown by the playwright driver. That
 * promise holds only if app code logs through the one door that always
 * feeds the buffer:
 *
 *   logger.error('mutation rejected', error);   // ✅ captured in EVERY build
 *   console.error('mutation rejected', error);  // ❌ captured only in dev
 *                                               //    (the console patch);
 *                                               //    invisible in production
 *
 * A raw console call looks identical in devtools, so nothing complains —
 * the hole is discovered in production, when a user reports a failure and
 * the error buffer that was supposed to explain it is empty. This rule
 * turns the raw call into a build error pointing at `logger` (wheel/core).
 *
 * Escape hatch for the genuinely deliberate console surface (a debug tool's
 * "log to console" button, the capture system's own forwarding): an
 * immediately adjacent comment, same line or the line above:
 *
 *   // wheel-console: <a substantive reason, 20+ chars>
 *
 * Test files are exempt (asserting on console output is a normal test move).
 */
const CONSOLE_METHODS = new Set(['log', 'info', 'warn', 'error', 'debug', 'trace']);

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'app code logs through wheel logger (captured in every build), never raw console.* — deliberate console surfaces carry an adjacent wheel-console reason'
    },
    messages: {
      rawConsole:
        'Raw `console.{{method}}` is only captured by the DEV console patch — in production this line is invisible to the error buffer. Use `logger.{{suggested}}` from wheel/core (captured in every build), or mark a deliberate console surface with an adjacent `// wheel-console: <reason>`.'
    },
    schema: []
  },
  create(context) {
    if (/\.test\.[jt]sx?$/.test(context.filename) || /\.test-d\.tsx?$/.test(context.filename)) {
      return {};
    }

    // Every line a substantive wheel-console reason touches (a comment's end
    // line): a console call on that line or the line directly below is
    // covered. Line-based on purpose — comment ATTACHMENT in the AST is
    // fickle; line adjacency is what reviewers actually see.
    let reasonLines = null;
    function hasConsoleReason(node) {
      if (reasonLines === null) {
        reasonLines = new Set();
        for (const comment of context.sourceCode.getAllComments()) {
          if (/wheel-console:\s+\S.{19,}/s.test(comment.value)) {
            reasonLines.add(comment.loc.end.line);
          }
        }
      }
      const line = node.loc.start.line;
      return reasonLines.has(line) || reasonLines.has(line - 1);
    }

    return {
      MemberExpression(node) {
        if (
          node.computed ||
          node.object.type !== 'Identifier' ||
          node.object.name !== 'console' ||
          node.property.type !== 'Identifier' ||
          !CONSOLE_METHODS.has(node.property.name)
        ) {
          return;
        }
        if (hasConsoleReason(node)) return;
        const method = node.property.name;
        const suggested = method === 'warn' ? 'warn' : method === 'error' ? 'error' : 'info';
        context.report({ node, messageId: 'rawConsole', data: { method, suggested } });
      }
    };
  }
};
