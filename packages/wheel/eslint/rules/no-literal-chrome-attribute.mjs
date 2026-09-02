/**
 * WHY THIS RULE EXISTS
 *
 * The annotator marks its own overlays with an attribute, and three places
 * read it: the screenshot filter, the hit-test, and the recorder. Every one of
 * them answers the same question — "is this the tool, or the app?"
 *
 * `rasterize.ts` kept its own copy of the selector as a string literal. When
 * the attribute moved to `core/chrome.ts` and was renamed, that copy stayed
 * behind. Nothing broke loudly: a filter that matches nothing simply lets
 * everything through, so the annotator's own outline started appearing inside
 * every screenshot it took, and the test that guarded it hardcoded the same
 * stale string, agreed with the code, and passed.
 *
 * That is the failure mode this rule exists for. A marker attribute is a
 * contract between files that never import each other, so it has to have
 * exactly one spelling.
 *
 * ❌ const CHROME_SELECTOR = '[data-wheel-chrome]';
 *    element.closest('[data-wheel-chrome]')
 *    <div data-wheel-chrome="" />
 *
 * ✅ import { CHROME_SELECTOR, chromeMark } from '../core/chrome';
 *    element.closest(CHROME_SELECTOR)
 *    <div {...chromeMark} />
 */

/** The one file allowed to spell it: the module that defines it. */
const OWNER = 'core/chrome.ts';

/** Marker attributes that must come from their constant, with where to get it. */
const MARKERS = [
  { name: 'data-wheel-chrome', from: 'CHROME_ATTRIBUTE / CHROME_SELECTOR / chromeMark in core/chrome.ts' },
  { name: 'data-wheel-annotate-chrome', from: 'CHROME_ATTRIBUTE in core/chrome.ts (this is its OLD name)' }
];

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Marker attributes come from their constant, never from a copy of the string.'
    },
    schema: [],
    messages: {
      literal:
        'Do not write "{{name}}" as a literal — a copy of a marker attribute goes stale silently when the attribute is renamed, and a selector that matches nothing fails by letting everything through. Import it: {{from}}.'
    }
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (filename.replaceAll('\\', '/').endsWith(OWNER)) return {};

    /** Report any marker name spelled out inside a string. */
    function check(node, text) {
      if (typeof text !== 'string') return;
      for (const marker of MARKERS) {
        if (text.includes(marker.name)) {
          context.report({ node, messageId: 'literal', data: { name: marker.name, from: marker.from } });
          return;
        }
      }
    }

    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
      JSXAttribute(node) {
        if (node.name.type === 'JSXIdentifier') check(node, node.name.name);
        else if (node.name.type === 'JSXNamespacedName') {
          check(node, `${node.name.namespace.name}:${node.name.name.name}`);
        }
      }
    };
  }
};
