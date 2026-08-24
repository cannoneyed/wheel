/**
 * WHY THIS RULE EXISTS (the constructor runs LAST, and `computed` runs NOW):
 *
 * This crashed the kanban demo the first time anyone navigated to it:
 *
 *   private readonly boardService: BoardService;                       // ❌
 *   readonly tags = this.computed(() => this.boardService.tags());
 *   constructor(context) {
 *     super(context);
 *     this.boardService = this.service(BoardService);
 *   }
 *
 *   // Uncaught TypeError: Cannot read properties of undefined (reading 'tags')
 *
 * Two facts collide. First, JavaScript runs every class FIELD initializer before
 * the first line of the constructor body — so at the moment `tags` is built,
 * `this.boardService` is still `undefined`. Second, `this.computed(fn)` is a
 * Solid `createMemo`, which calls `fn` IMMEDIATELY rather than waiting for a
 * reader. Put together, the computed reads a dependency that does not exist yet.
 *
 * The fix is to declare the dependency as a field, where it is initialized in
 * the same pass and in the right order:
 *
 *   private readonly boardService = this.service(BoardService);        // ✅
 *   readonly tags = this.computed(() => this.boardService.tags());
 *
 * WHAT IS AND ISN'T FLAGGED. Only EAGER reads are errors — the initializer
 * expression itself, and the callback passed to `this.computed(...)`, both of
 * which run during field initialization. A read inside an `action`, a
 * `computedFor`, or any other callback happens later, once the constructor has
 * long since finished, so those are left alone:
 *
 *   readonly clear = this.action(() => this.boardService.reset());          // ✅ lazy
 *   readonly cardsIn = this.computedFor((id) => this.boardService.in(id));  // ✅ lazy
 *
 * A field that has BOTH an initializer and a constructor assignment is fine too
 * — the initializer already gave it a value before anything could read it.
 */

/** Callbacks in argument 0 of these `this.*` calls run during field init. */
const EAGER_CALLBACK_METHODS = new Set(['computed']);

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration'
]);

/** `this.<name>`, with a plain (non-computed) property — otherwise null. */
function thisPropertyName(node) {
  if (!node || node.type !== 'MemberExpression' || node.computed) return null;
  if (node.object.type !== 'ThisExpression') return null;
  if (node.property.type !== 'Identifier') return null;
  return node.property.name;
}

/** For `this.computed(fn)`, the `fn` whose body runs during field init. */
function eagerCallbackArg(node) {
  if (!node || node.type !== 'CallExpression') return null;
  const method = thisPropertyName(node.callee);
  if (!method || !EAGER_CALLBACK_METHODS.has(method)) return null;
  const first = node.arguments[0];
  if (!first) return null;
  return FUNCTION_TYPES.has(first.type) ? first : null;
}

/** Child nodes of any ESTree node, in no particular order. */
function* children(node) {
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const entry of value) if (entry && typeof entry.type === 'string') yield entry;
    } else if (value && typeof value.type === 'string') {
      yield value;
    }
  }
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'a class field initializer must not read a field that is only assigned in the constructor'
    },
    messages: {
      earlyRead:
        "`this.{{name}}` is still undefined here. It is assigned in the constructor, and every field initializer — including a `this.computed(...)` callback, which runs immediately — finishes BEFORE the constructor body starts. Initialize it as a field instead: `private readonly {{name}} = this.service(...)`."
    },
    schema: []
  },
  create(context) {
    return {
      ClassBody(classBody) {
        const ctor = classBody.body.find(
          (member) => member.type === 'MethodDefinition' && member.kind === 'constructor'
        );
        if (!ctor?.value?.body) return;

        // Every `this.x = …` the constructor performs, at any nesting depth.
        const assigned = new Set();
        const collect = (node) => {
          if (node.type === 'AssignmentExpression') {
            const name = thisPropertyName(node.left);
            if (name) assigned.add(name);
          }
          for (const child of children(node)) collect(child);
        };
        collect(ctor.value.body);
        if (assigned.size === 0) return;

        // A field with its own initializer already holds a value before anything
        // could read it, whatever the constructor assigns to it afterwards.
        for (const member of classBody.body) {
          if (member.type === 'PropertyDefinition' && member.value) {
            const name = member.key?.type === 'Identifier' ? member.key.name : null;
            if (name) assigned.delete(name);
          }
        }
        if (assigned.size === 0) return;

        /**
         * Walk one initializer, reporting reads that happen NOW.
         *
         * Descent stops at any function body — that code runs later — except the
         * callback of `this.computed(...)`, which the memo invokes immediately
         * and which is therefore stepped into deliberately.
         */
        const scan = (node) => {
          const eagerArg = eagerCallbackArg(node);
          if (eagerArg) {
            for (const arg of node.arguments) scan(arg === eagerArg ? arg.body : arg);
            return;
          }
          const name = thisPropertyName(node);
          if (name) {
            if (assigned.has(name)) {
              context.report({ node, messageId: 'earlyRead', data: { name } });
            }
            return;
          }
          if (FUNCTION_TYPES.has(node.type)) return;
          for (const child of children(node)) scan(child);
        };

        for (const member of classBody.body) {
          if (member.type !== 'PropertyDefinition' || !member.value || member.static) continue;
          scan(member.value);
        }
      }
    };
  }
};
