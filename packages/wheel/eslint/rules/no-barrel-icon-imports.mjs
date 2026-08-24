/**
 * WHY THIS RULE EXISTS (the 1500-module dev page load):
 *
 * Icon packs export every icon from their root ("barrel") entry:
 *
 *   import { Plus } from 'lucide-solid';        // ❌ looks innocent
 *
 * A production build tree-shakes that down to one icon — but the DEV server
 * doesn't tree-shake at all. It serves modules as written, so that one line
 * makes the browser fetch the barrel PLUS every icon it re-exports: ~1500
 * network requests on every page load, for one plus sign. The pain shows up
 * far from the import: a devtools network tab drowning in `*.jsx` icon
 * files and a sluggish first paint, with no error anywhere.
 *
 * Every icon pack ships per-icon entry points for exactly this reason:
 *
 *   import Plus from 'lucide-solid/icons/plus'; // ✅ one file fetched
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'import icons from per-icon subpaths, never the pack barrel (dev serves every re-export)' },
    messages: {
      barrelImport:
        "Import icons by subpath — `import {{local}} from '{{pkg}}/icons/{{slug}}'` — the barrel makes the dev server load every icon in the pack (~1500 requests) on each page."
    },
    schema: []
  },
  create(context) {
    /** Icon-pack roots whose barrels re-export the whole set. */
    const BARRELS = new Set(['lucide-solid', 'lucide-react', 'lucide']);
    /** PascalCase icon name → the pack's kebab-case module slug (Redo2 → redo-2). */
    const slugOf = (name) =>
      name
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/([a-zA-Z])(\d)/g, '$1-$2')
        .toLowerCase();
    return {
      ImportDeclaration(node) {
        if (!BARRELS.has(node.source.value)) return;
        const named = node.specifiers.find((spec) => spec.type === 'ImportSpecifier');
        const local = named?.local?.name ?? 'Icon';
        context.report({
          node,
          messageId: 'barrelImport',
          data: { local, pkg: node.source.value, slug: slugOf(named?.imported?.name ?? local) }
        });
      }
    };
  }
};
