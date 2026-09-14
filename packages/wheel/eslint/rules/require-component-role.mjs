/**
 * WHY THIS RULE EXISTS (a shared component has no identity of its own):
 *
 * A component from `wheel/components` is the same component everywhere. The
 * todos demo renders one `Button` to add a todo and one per row to delete
 * one, and the component tree showed:
 *
 *   Button#1   Button#2   Button#3   Button#4
 *
 * Which is the add button? The numbering is by mount order across the whole
 * page, so it also RESHUFFLES when a row mounts. Every surface that names an
 * instance inherits the problem: the debug tree, `data-wheel-id`, an
 * annotation's anchor, `__wheel.component('Button#2')`, a playwright selector.
 *
 * `data-wheel-role` is the caller saying which one this is, and it becomes
 * part of the id rather than a label beside it:
 *
 *   <Button onClick={add}>＋</Button>                        // ❌ Button#1
 *   <Button data-wheel-role="add" onClick={add}>＋</Button>  // ✅ Button(add)
 *
 * Distinct roles need no number at all. Instances that genuinely ARE the same
 * thing still number — `Button(delete)#1`, `Button(delete)#2` — and now the
 * number means "which row", which is what a number should mean.
 *
 * Scope: JSX whose tag is imported from `wheel/components` or one of its
 * public subpaths. Compound PARTS
 * (`Dialog.Portal`, `Radio.Indicator`) are exempt: their identity comes from
 * the root they belong to, and tagging every part would bury the roots. A
 * root used through a member expression (`Dialog.Root`, `Avatar.Root`) is NOT
 * exempt — it is as anonymous as a bare `Button`.
 *
 * Escape hatch, for a component that genuinely mounts once on a page and
 * whose bare name already says what it is:
 * `// wheel-component-role: <reason>`.
 */

/** Parts whose identity comes from the root above them, not from the caller. */
const ROOT_MEMBERS = new Set(['Root', 'Trigger']);

/** Public subpaths whose main export is a namespace of compound parts. */
const COMPOUND_SUBPATHS = new Set([
  'accordion',
  'alert-dialog',
  'autocomplete',
  'avatar',
  'checkbox',
  'collapsible',
  'combobox',
  'context-menu',
  'dialog',
  'drawer',
  'field',
  'fieldset',
  'menu',
  'meter',
  'navigation-menu',
  'number-field',
  'otp-field',
  'popover',
  'preview-card',
  'progress',
  'radio',
  'scroll-area',
  'select',
  'slider',
  'switch',
  'tabs',
  'toast',
  'toolbar',
  'tooltip'
]);

function componentSource(value) {
  if (value === 'wheel/components') return { kind: 'barrel' };
  const prefix = 'wheel/components/';
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null;
  const subpath = value.slice(prefix.length);
  if (!subpath || subpath === 'styles' || subpath.includes('/')) return null;
  return { kind: COMPOUND_SUBPATHS.has(subpath) ? 'compound' : 'simple', subpath };
}

function exportName(subpath) {
  return subpath
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'shared components from wheel/components carry `data-wheel-role`, so instances are named rather than numbered'
    },
    messages: {
      missingRole:
        "<{{tag}}> is a shared component, so its instances are told apart only by mount order (`{{name}}#2`) — which reshuffles when siblings mount, and names nothing. Add `data-wheel-role=\"…\"` to say which one this is (`{{name}}(save)`) — or explain with `// wheel-component-role: <reason>`."
    },
    schema: []
  },
  create(context) {
    if (/\.test\.(ts|tsx)$/.test(context.filename)) return {};
    if (/wheel-component-role:/.test(context.sourceCode.getText())) return {};

    /** Local bindings and the public component surface each binding names. */
    const shared = new Map();

    return {
      ImportDeclaration(node) {
        const source = componentSource(node.source?.value);
        if (!source) return;
        for (const specifier of node.specifiers ?? []) {
          // Types carry no runtime instance.
          if (specifier.importKind === 'type' || node.importKind === 'type') continue;
          if (!specifier.local?.name || specifier.type === 'ImportDefaultSpecifier') continue;
          if (specifier.type === 'ImportNamespaceSpecifier') {
            shared.set(specifier.local.name, { ...source, namespace: true });
            continue;
          }
          const imported = specifier.imported?.name;
          if (
            source.kind === 'compound' &&
            !ROOT_MEMBERS.has(imported) &&
            imported !== exportName(source.subpath)
          ) {
            // The compound namespace and its Root/Trigger establish identity;
            // Portal, Backdrop, Indicator, and other parts inherit it.
            continue;
          }
          if (source.kind === 'simple' && !/^[A-Z]/.test(imported ?? '')) continue;
          shared.set(specifier.local.name, { ...source, namespace: false, imported });
        }
      },
      JSXOpeningElement(node) {
        const name = node.name;
        let tag = null;
        let base = null;
        let member = null;
        if (name?.type === 'JSXIdentifier') {
          base = name.name;
          tag = name.name;
        } else if (name?.type === 'JSXMemberExpression' && name.object?.type === 'JSXIdentifier') {
          base = name.object.name;
          tag = `${name.object.name}.${name.property?.name ?? ''}`;
          member = name.property?.name;
        } else if (
          name?.type === 'JSXMemberExpression' &&
          name.object?.type === 'JSXMemberExpression' &&
          name.object.object?.type === 'JSXIdentifier'
        ) {
          base = name.object.object.name;
          tag = `${base}.${name.object.property?.name ?? ''}.${name.property?.name ?? ''}`;
          member = name.property?.name;
        }
        const binding = base ? shared.get(base) : null;
        if (!binding) return;

        if (binding.namespace) {
          if (binding.kind === 'simple') {
            if (name.object?.type !== 'JSXIdentifier' || !/^[A-Z]/.test(member ?? '')) return;
          } else if (binding.kind === 'barrel' && name.object?.type === 'JSXIdentifier') {
            // A namespace member such as Components.Button is a root unless it
            // names one of the compound namespaces.
            if (COMPOUND_SUBPATHS.has(member?.replace(/[A-Z]/g, (c, i) => `${i ? '-' : ''}${c.toLowerCase()}`))) return;
          } else if (!ROOT_MEMBERS.has(member)) {
            return;
          }
        } else if (name.type === 'JSXMemberExpression' && !ROOT_MEMBERS.has(member)) {
          // A PART belongs to the root above it; only roots need a role.
          return;
        }

        const hasRole = (node.attributes ?? []).some(
          (attribute) =>
            attribute.type === 'JSXAttribute' && attribute.name?.name === 'data-wheel-role'
        );
        // A spread may carry it; the linter cannot see inside, and guessing
        // wrong here would be noise on a legitimate pattern.
        const hasSpread = (node.attributes ?? []).some((attribute) => attribute.type === 'JSXSpreadAttribute');
        if (hasRole || hasSpread) return;

        context.report({
          node: name,
          messageId: 'missingRole',
          data: { tag, name: binding.imported ?? member ?? base }
        });
      }
    };
  }
};
