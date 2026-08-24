/**
 * WHY THIS RULE EXISTS (a plain `<a>` to an app path throws the app away):
 *
 *   <a href="/teams/core/issues">Issues</a>       // ❌ full page reload
 *   <Link to="team.issues" params={{ teamId }}>   // ✅ client-side navigation
 *
 * Both render the same underlying anchor and look identical on screen. The
 * difference only shows up at runtime, and it is not subtle once you see it:
 * the plain anchor triggers a document load, so the sync client reconnects
 * from scratch, unsaved local state is gone, and the page flashes white. The
 * `<Link>` swaps the matched route in place.
 *
 * The second, quieter cost: `<Link to="…">` is checked against the route
 * table. A typo'd route name is a compile error. A typo'd `href` string is a
 * 404 nobody notices until a user hits it.
 *
 * Only IN-APP paths are flagged — a literal starting with a single `/`.
 * External links (`https://`, `mailto:`), protocol-relative (`//cdn…`),
 * fragments (`#section`), and any computed/dynamic `href` are left alone,
 * because the router has no opinion about those.
 *
 * Deliberate exceptions say so in place:
 *
 *   {/* wheel-raw-anchor: full page load, proving the SPA fallback works *\/}
 *   <a href="/routing/does-not-exist">Broken link</a>
 */
const ESCAPE = /wheel-raw-anchor:\s*\S+/;

/** How far above the `href` an escape comment may sit and still count as adjacent. */
const ESCAPE_LINE_DISTANCE = 5;

/** Tests and browser specs describe navigation; they don't perform app navigation. */
function isExempt(filename) {
  const path = (filename ?? '').replace(/\\/g, '/');
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(path);
}

/** A same-app absolute path: one leading slash, not `//`. */
function isInAppPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'use <Link to="…"> instead of a raw <a href="/app/path">' },
    messages: {
      rawAnchor:
        'A plain <a href="{{href}}"> triggers a FULL PAGE LOAD: the sync client reconnects, unsaved state is lost, and the page flashes. Use the router\'s typed `<Link to="…">` (which also checks the destination exists), or keep this one with a `// wheel-raw-anchor: <reason>` comment.'
    },
    schema: []
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (isExempt(filename)) return {};
    const source = context.sourceCode ?? context.getSourceCode();

    return {
      JSXAttribute(node) {
        if (node.name?.type !== 'JSXIdentifier' || node.name.name !== 'href') return;
        const element = node.parent;
        if (element?.name?.type !== 'JSXIdentifier' || element.name.name !== 'a') return;
        if (node.value?.type !== 'Literal' || !isInAppPath(node.value.value)) return;
        // JSX comments are `{/* … */}` expression containers that attach as
        // SIBLINGS of the element, not to it — `getCommentsBefore` never sees
        // them. Scan by proximity instead: any escape comment ending within a
        // few lines above the attribute counts, which is what "adjacent" means
        // to a reader anyway.
        const line = node.loc.start.line;
        const excused = source
          .getAllComments()
          .some(
            (comment) =>
              ESCAPE.test(comment.value) &&
              comment.loc.end.line <= line &&
              line - comment.loc.end.line <= ESCAPE_LINE_DISTANCE
          );
        if (excused) return;
        context.report({ node, messageId: 'rawAnchor', data: { href: node.value.value } });
      }
    };
  }
};
