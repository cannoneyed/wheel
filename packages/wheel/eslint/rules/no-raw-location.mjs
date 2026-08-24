/**
 * WHY THIS RULE EXISTS (the URL has one owner, and it isn't `window`):
 *
 * Wheel's router keeps the current URL in an atom. `RouterService.navigate`
 * writes the atom AND the address bar; `popstate` writes the atom back. That
 * pairing is the only reason the debug panel, the inspector, and every test
 * seam see the truth.
 *
 * Reach around it and the two drift apart:
 *
 *   window.location.href = `/teams/${id}`;   // ❌ page reload, app state gone
 *   history.pushState(null, '', url);        // ❌ bar moves, atom does not —
 *                                            //    match() now describes the
 *                                            //    PREVIOUS page, forever
 *   router.navigate('team', { params: { teamId: id } });   // ✅
 *
 * The `pushState` case is the nasty one. Nothing throws. The URL in the bar is
 * right, so the bug looks like "the router is broken" — but the router never
 * heard about the navigation, because `pushState` deliberately does not fire
 * `popstate`. Every derived value stays stale until something else navigates.
 *
 * Scope: `location`/`window.location` reads and writes, and the four
 * `history` navigation methods. `packages/wheel/src/router/history.ts` is the
 * one blessed module — it IS the seam — and tests are exempt. Anything else
 * that genuinely needs the real thing (a hard reload after a logout, say) says
 * so in place:
 *
 *   // wheel-raw-location: full reload on sign-out, deliberately drops app state
 *   window.location.assign('/login');
 */
const HISTORY_METHODS = new Set(['pushState', 'replaceState', 'back', 'forward', 'go']);
const LOCATION_MEMBERS = new Set(['href', 'pathname', 'search', 'hash', 'assign', 'replace', 'reload']);
const ESCAPE = /wheel-raw-location:\s*\S+/;

/** How far above the call an escape comment may sit and still read as adjacent. */
const ESCAPE_LINE_DISTANCE = 5;

/** The blessed seam plus tests; everything else is governed. */
function isExempt(filename) {
  const path = (filename ?? '').replace(/\\/g, '/');
  return (
    /\/router\/history\.(ts|tsx|js)$/.test(path) ||
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(path) ||
    /\/browser\/[^/]*\.spec\.ts$/.test(path)
  );
}

/** `location` or `window.location` / `globalThis.location`. */
function isLocationObject(node) {
  if (node.type === 'Identifier') return node.name === 'location';
  if (node.type !== 'MemberExpression' || node.computed) return false;
  return (
    node.property.type === 'Identifier' &&
    node.property.name === 'location' &&
    node.object.type === 'Identifier' &&
    (node.object.name === 'window' || node.object.name === 'globalThis')
  );
}

/** `history` or `window.history` / `globalThis.history`. */
function isHistoryObject(node) {
  if (node.type === 'Identifier') return node.name === 'history';
  if (node.type !== 'MemberExpression' || node.computed) return false;
  return (
    node.property.type === 'Identifier' &&
    node.property.name === 'history' &&
    node.object.type === 'Identifier' &&
    (node.object.name === 'window' || node.object.name === 'globalThis')
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'route through RouterService instead of window.location / history'
    },
    messages: {
      rawLocation:
        'Reading or writing `location.{{member}}` bypasses the router, whose URL atom is the app\'s single source of truth. Use RouterService (`router.url.get()`, `router.navigate(...)`, `<Link>`), or justify this one with a `// wheel-raw-location: <reason>` comment above it.',
      rawHistory:
        '`history.{{member}}()` moves the address bar without telling the router — and `pushState` does not fire `popstate`, so the URL atom and every value derived from it stay stale with no error anywhere. Use `router.navigate(...)` / `router.back()` / `router.forward()`, or justify this one with a `// wheel-raw-location: <reason>` comment above it.'
    },
    schema: []
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (isExempt(filename)) return {};
    const source = context.sourceCode ?? context.getSourceCode();

    /**
     * An adjacent `wheel-raw-location:` comment excuses this site.
     *
     * Matched by PROXIMITY rather than AST attachment: the offending member
     * expression is often buried mid-statement (inside a `??` chain, an
     * argument list, a JSX attribute), where `getCommentsBefore` finds nothing
     * even though the reason is plainly written right above it.
     */
    const excused = (node) => {
      const line = node.loc.start.line;
      return source
        .getAllComments()
        .some(
          (comment) =>
            ESCAPE.test(comment.value) &&
            comment.loc.end.line <= line &&
            line - comment.loc.end.line <= ESCAPE_LINE_DISTANCE
        );
    };

    return {
      MemberExpression(node) {
        if (node.computed || node.property.type !== 'Identifier') return;
        const member = node.property.name;
        if (isLocationObject(node.object) && LOCATION_MEMBERS.has(member)) {
          if (excused(node)) return;
          context.report({ node, messageId: 'rawLocation', data: { member } });
          return;
        }
        if (isHistoryObject(node.object) && HISTORY_METHODS.has(member)) {
          if (excused(node)) return;
          context.report({ node, messageId: 'rawHistory', data: { member } });
        }
      }
    };
  }
};
