/**
 * WHY THIS RULE EXISTS (the frozen-Owner bug):
 *
 * Atoms deep-freeze everything you put in them — that's how "nobody can
 * mutate state behind your back" is enforced. But freezing is only safe for
 * DATA. Live runtime objects (a DOM element, a Solid Owner, a promise
 * resolver) have internals the runtime itself must keep mutating; freezing
 * them corrupts the machinery. We hit this for real: storing a dialog's
 * Owner in an atom froze Solid's reactive graph and broke unrelated cleanup
 * with a baffling "Cannot delete property '4' of [object Array]".
 *
 * The doctrine: atoms hold data; runtime handles live in plain class fields
 * (see DialogService.currentEntry for the pattern). This rule catches the
 * declared-type half of that doctrine:
 *
 *   this.atom<HTMLElement | null>(null)         // ❌ handle in an atom
 *   this.atom<Promise<Doc>>(...)                // ❌ a promise resolver is a handle
 *   private addInput: HTMLInputElement | null   // ✅ plain field
 *
 * INFERENCE GAP (documented, not silently ignored): the rule reads the
 * DECLARED TYPE ARGUMENT text. When an atom has no type argument, it also
 * catches the few initializer EXPRESSIONS that are unmistakably handles at the
 * syntax level — `this.atom(new Promise(...))`, `this.atom(document.createElement(...))`,
 * `this.atom(getOwner())`. It CANNOT catch a handle that arrives through a
 * variable or a function's return value (`this.atom(el)` where `el: HTMLElement`)
 * — that needs the type checker, which ESLint here does not run. So this rule
 * is a fast tripwire for the common shapes, not a proof of absence; a handle
 * laundered through a typed local still requires review to catch.
 */
const HANDLE_TYPES =
  /\b(Owner|HTMLElement|HTMLInputElement|HTMLDivElement|Element|Node|EventTarget|Document|Window|Promise)\b/;

/** Constructors/factories whose result is a live handle, recognizable by syntax alone. */
const HANDLE_CTORS = new Set(['Promise']);
const HANDLE_FACTORIES = new Set(['getOwner', 'createElement']);

/** Does an initializer expression obviously produce a runtime handle (no types needed)? */
function initializerIsHandle(arg) {
  if (!arg) return null;
  // new Promise(...) / new Something(...) matching a known handle constructor.
  if (arg.type === 'NewExpression' && arg.callee?.type === 'Identifier' && HANDLE_CTORS.has(arg.callee.name)) {
    return arg.callee.name;
  }
  // getOwner() or document.createElement(...) — factory calls returning handles.
  if (arg.type === 'CallExpression') {
    const callee = arg.callee;
    if (callee?.type === 'Identifier' && HANDLE_FACTORIES.has(callee.name)) return callee.name;
    if (callee?.type === 'MemberExpression' && HANDLE_FACTORIES.has(callee.property?.name)) {
      return callee.property.name;
    }
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'atoms hold data, never runtime handles (DOM elements, Owners) — freezing a live object corrupts it' },
    messages: {
      handleInAtom:
        'This atom would deep-freeze a live runtime object ({{match}}), corrupting it. Atoms hold DATA; keep handles in a plain class field (see DialogService.currentEntry for the pattern).'
    },
    schema: []
  },
  create(context) {
    const source = context.sourceCode;
    return {
      CallExpression(node) {
        // this.atom<...>(...) — inspect the declared type argument's text.
        const callee = node.callee;
        const isAtomCall =
          callee?.type === 'MemberExpression' &&
          callee.property?.name === 'atom' &&
          callee.object?.type === 'ThisExpression';
        if (!isAtomCall) return;
        const typeArgs = node.typeArguments ?? node.typeParameters;
        if (typeArgs) {
          const text = source.getText(typeArgs);
          const match = text.match(HANDLE_TYPES);
          if (match) {
            context.report({ node: typeArgs, messageId: 'handleInAtom', data: { match: match[0] } });
          }
          return;
        }
        // No declared type argument — fall back to obvious handle initializers.
        const handle = initializerIsHandle(node.arguments[0]);
        if (handle) {
          context.report({ node, messageId: 'handleInAtom', data: { match: handle } });
        }
      }
    };
  }
};
