/**
 * WHY THIS RULE EXISTS
 *
 * A color typed straight into a TS/TSX file cannot follow the theme. It is
 * the same value in light mode and dark mode, it ignores every later palette
 * change, and nothing errors — the component just renders the wrong color on
 * one theme, which nobody sees until a screenshot of the other theme lands in
 * review. The design pass that produced this rule found the repo running
 * three separate palettes under the SAME variable names, so a component moved
 * between packages silently re-themed itself. Tokens are how that stops
 * happening: `packages/wheel/src/styles/tokens.css` defines the palette once,
 * per theme, and every surface reads it.
 *
 *   ❌ <div style={{ background: '#f6f7f9' }} />        // frozen in one theme
 *   ❌ style={{ color: 'rgb(91 100 114)' }}             // same problem
 *   ✅ <div style={{ background: 'var(--wheel-surface)' }} />
 *   ✅ style={{ color: 'var(--wheel-ink-muted, #5b6472)' }}  // fallback: allowed
 *
 * THE var() FALLBACK IS DELIBERATE AND STAYS LEGAL. `var(--wheel-x, #fff)`
 * still tracks the theme — the literal only appears when the token is
 * missing, which is exactly what kit needs: kit components ship into host
 * apps that may not have loaded tokens.css yet, so ~120 of these fallbacks
 * exist on purpose. The rule blanks every `var(...)` before it looks for
 * colors, so a fallback is never reported.
 *
 * CSS USES THE SAME BOUNDARY. Stylelint rejects color literals in normal CSS
 * declarations. A stylesheet defines the literal in a custom property, then
 * reads it with `var()`. This rule owns only TS and TSX strings.
 *
 * CANVAS AND WEBGL PAINT STAYS LEGAL. A literal assigned to `fillStyle`,
 * `strokeStyle`, or `shadowColor` paints pixels; it does not style application
 * chrome. Gradient stops and WebGL renderer color receivers work the same way.
 * Receiver shape keeps this exemption local. A canvas component's ordinary
 * DOM style strings still need tokens.
 *
 * SCOPE: `.ts`/`.tsx` under the kernel and every app package. Exempt by
 * filename INSIDE the rule (not by a config glob, which would go stale):
 * `*.test.ts(x)`, `*.states.tsx`, and anything under a `fixtures/` directory
 * — a fixture's peer color is test data describing a scenario, not styling.
 *
 * ESCAPE HATCH: `// wheel-color: <reason>` (20+ chars) on the line above, for
 * the handful of non-paint values with no token — translucent washes over
 * unknown backgrounds, directional shadow tints, per-user identity colors
 * derived from a hash. Same mechanism as `wheel-view-timing` /
 * `wheel-console`: greppable, in the file, and it names why.
 */

/** #rgb, #rgba, #rrggbb, #rrggbbaa — and nothing longer (hex-encoded data is not a color). */
const HEX_COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-fA-F])/;

/** `rgb(`, `rgba(`, `hsl(`, `hsla(` — the opening is enough, template literals split the rest. */
const FUNCTION_COLOR = /\b(?:rgba?|hsla?)\s*\(/;

/** Canvas 2D properties whose string value paints pixels. */
const CANVAS_PAINT_PROPERTIES = new Set(['fillStyle', 'strokeStyle', 'shadowColor']);

/** Canvas 2D methods whose color argument paints pixels. */
const CANVAS_PAINT_METHODS = new Set(['addColorStop']);

/** WebGL renderer methods that consume a paint color. */
const WEBGL_PAINT_METHODS = new Set(['setClearColor', 'setColorAt']);

/** The static property name of an ESTree member/property node, or null. */
function staticPropertyName(node) {
  if (!node || (node.type !== 'MemberExpression' && node.type !== 'Property')) return null;
  if (!node.computed && node.key?.type === 'Identifier') return node.key.name;
  if (!node.computed && node.property?.type === 'Identifier') return node.property.name;
  const property = node.key ?? node.property;
  return property?.type === 'Literal' && typeof property.value === 'string' ? property.value : null;
}

/** The final name in a call/new target (`THREE.Color` → `Color`), or null. */
function calleeName(node) {
  if (node?.type === 'Identifier') return node.name;
  return staticPropertyName(node);
}

/** Expression wrappers that preserve the value's paint destination. */
function wrapsValue(parent, child) {
  if (parent.type === 'TemplateLiteral') return parent.quasis.includes(child) || parent.expressions.includes(child);
  if (parent.type === 'ConditionalExpression') return parent.consequent === child || parent.alternate === child;
  if (parent.type === 'LogicalExpression') return parent.left === child || parent.right === child;
  return (
    ['ChainExpression', 'TSAsExpression', 'TSTypeAssertion', 'TSNonNullExpression'].includes(parent.type) &&
    parent.expression === child
  );
}

/** True when a call receiver is a canvas/WebGL paint API. */
function isPaintCall(call) {
  const name = calleeName(call.callee);
  if (CANVAS_PAINT_METHODS.has(name) || WEBGL_PAINT_METHODS.has(name)) return true;
  if (name !== 'set' && name !== 'setStyle') return false;
  return staticPropertyName(call.callee.object) === 'color';
}

/** True when `node` supplies a literal color to a canvas/WebGL paint receiver. */
function isPaintValue(node) {
  let current = node;
  for (;;) {
    const parent = current.parent;
    if (!parent) return false;
    if (wrapsValue(parent, current)) {
      current = parent;
      continue;
    }
    if (
      parent.type === 'AssignmentExpression' &&
      parent.right === current &&
      CANVAS_PAINT_PROPERTIES.has(staticPropertyName(parent.left))
    ) {
      return true;
    }
    if (parent.type === 'CallExpression' && parent.arguments.includes(current)) {
      return isPaintCall(parent);
    }
    if (parent.type === 'NewExpression' && parent.arguments.includes(current)) {
      return calleeName(parent.callee) === 'Color';
    }
    if (parent.type === 'Property' && parent.value === current && staticPropertyName(parent) === 'color') {
      const object = parent.parent;
      const construct = object?.parent;
      return (
        object?.type === 'ObjectExpression' &&
        construct?.type === 'NewExpression' &&
        construct.arguments.includes(object) &&
        /Material$/.test(calleeName(construct.callee) ?? '')
      );
    }
    return false;
  }
}

/**
 * Blank out every `var(...)` span so a sanctioned fallback color inside one is
 * invisible to the scan. A `var()`'s FIRST argument is always a custom-property
 * name, so nothing outside the fallback is ever lost by erasing the whole call.
 * Length is preserved (spaces) — indices stay meaningful for the caller.
 */
function eraseVarFallbacks(text) {
  let out = text;
  for (;;) {
    const start = out.indexOf('var(');
    if (start === -1) return out;
    let depth = 0;
    let end = -1;
    for (let i = start + 3; i < out.length; i += 1) {
      if (out[i] === '(') depth += 1;
      else if (out[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    // Unbalanced (an interpolated template chunk) — erase to the end.
    const stop = end === -1 ? out.length : end + 1;
    out = out.slice(0, start) + ' '.repeat(stop - start) + out.slice(stop);
  }
}

/** The color literal in `text`, ignoring var() fallbacks — or null. */
function findColor(text) {
  const scanned = eraseVarFallbacks(text);
  const hex = scanned.match(HEX_COLOR);
  if (hex) return hex[0];
  const fn = scanned.match(FUNCTION_COLOR);
  if (fn) return fn[0].replace(/\s*\($/, '()');
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'no hardcoded theme colors in ts/tsx — read a token from styles/tokens.css (var() fallbacks and canvas/WebGL paint stay legal)'
    },
    messages: {
      hardcodedColor:
        "Hardcoded color `{{color}}` cannot follow the theme — it renders the same in light and dark and ignores every palette change. Use a token from packages/wheel/src/styles/tokens.css (`var(--wheel-…)`), or `var(--wheel-…, {{color}})` if a fallback is genuinely needed. No token fits? Add `// wheel-color: <reason>` above the line."
    },
    schema: []
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    // In-rule exemptions, deliberately NOT config globs: a glob carve-out goes
    // stale silently, a filename check travels with the rule. Test files and
    // state manifests describe scenarios ("the red one"), and fixture colors
    // are data under test, not styling.
    if (
      /\.test\.[jt]sx?$/.test(filename) ||
      /\.states\.tsx$/.test(filename) ||
      /(?:^|[\\/])fixtures[\\/]/.test(filename)
    ) {
      return {};
    }

    /** Every line a substantive `wheel-color:` reason covers (the line below it). */
    const excusedLines = new Set();
    for (const comment of context.sourceCode.getAllComments()) {
      if (/wheel-color:\s+\S.{19,}/s.test(comment.value)) {
        excusedLines.add(comment.loc.end.line + 1);
        // A trailing comment excuses its own line too.
        excusedLines.add(comment.loc.end.line);
      }
    }

    function report(node, text, ...alsoCoveredBy) {
      if (isPaintValue(node)) return;
      if (excusedLines.has(node.loc.start.line)) return;
      if (alsoCoveredBy.some((line) => excusedLines.has(line))) return;
      const color = findColor(text);
      if (color) context.report({ node, messageId: 'hardcodedColor', data: { color } });
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') report(node, node.value);
      },
      TemplateLiteral(node) {
        // Each chunk is scanned on its own: `hsl(${hue} 70% 45%)` is a color
        // being BUILT, and the `hsl(` chunk is what gives it away. A multi-line
        // template's pragma sits above the whole literal, so that line counts too.
        for (const quasi of node.quasis) {
          const raw = quasi.value.cooked ?? quasi.value.raw;
          if (findColor(raw)) {
            report(quasi, raw, node.loc.start.line);
            return;
          }
        }
      }
    };
  }
};
