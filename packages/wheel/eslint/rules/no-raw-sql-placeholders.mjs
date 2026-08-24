/**
 * WHY THIS RULE EXISTS
 *
 * There are two ways to write SQL here, and only one of them is safe to put a
 * `$1` in.
 *
 *   ❌ await db.query('insert into teams (id, name) values ($1, $2)', [id, name]);
 *   ✅ await db.query(sql`insert into teams (id, name) values (${id}, ${name})`);
 *
 * A sql`` fragment carries NO placeholder syntax. The SQLite backend writes
 * `?` placeholders when it compiles the fragment. A raw string goes to the
 * driver exactly as you typed it. Nothing translates it.
 *
 * On SQLite that is not a subtle bug — SQLite reads `$1` as a NAMED parameter,
 * never binds it to your positional array, and the driver throws
 * "Too many parameter values were provided" at runtime. The statement never
 * runs. TypeScript sees a `string` and a `unknown[]` and is perfectly happy,
 * so nothing catches it until the seed, migration, or handler executes — often
 * only in the one environment that exercises that code path.
 *
 * The framework used to paper over this with a text-rewriting bridge that
 * scanned compiled SQL and swapped `$n` for `?`. It was applied by habit at
 * call sites that had no parameters at all, it could corrupt a `$1` inside a
 * double-quoted identifier, and it meant placeholders were written twice —
 * once by the sql tag, once by a regex undoing it. SQLite-only compilation
 * replaced it. This rule keeps the old habit from returning.
 *
 * THE RULE: a string or template literal passed to `.query(...)` / `.run(...)`
 * may not contain a `$` followed by a digit. If it needs parameters, it should
 * be a sql`` fragment.
 *
 * SCOPE: all app and kernel TypeScript, including tests — a test that seeds
 * with `$1` fails exactly as loudly as production does.
 */

/** Methods whose first argument is SQL text handed straight to a driver. */
const SQL_METHODS = new Set(['query', 'run', 'all', 'exec', 'unsafe']);

/** A `$` followed by a digit. SQLite treats this as a named placeholder. */
const PG_PLACEHOLDER = /\$\d/;

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'raw SQL strings must not carry $n placeholders because SQLite receives them unchanged'
    },
    messages: {
      rawPlaceholder:
        'This raw SQL string contains `{{placeholder}}`. SQLite treats it as a named parameter, so a positional value array does not bind it. Use `?`, or use a sql`` fragment (`sql`... values (${x})``).'
    },
    schema: []
  },
  create(context) {
    /** The literal SQL text of a node, or null when it is not a plain string/template. */
    function sqlTextOf(node) {
      if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
      // A template literal WITH a tag is a sql`` fragment, not raw text — the
      // caller never sees its placeholders. Only untagged ones are raw.
      if (node.type === 'TemplateLiteral') return node.quasis.map((quasi) => quasi.value.raw).join('');
      return null;
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression' || node.callee.computed) return;
        if (node.callee.property.type !== 'Identifier') return;
        if (!SQL_METHODS.has(node.callee.property.name)) return;
        const first = node.arguments[0];
        if (!first) return;
        const text = sqlTextOf(first);
        if (text === null) return;
        const match = text.match(PG_PLACEHOLDER);
        if (!match) return;
        context.report({
          node: first,
          messageId: 'rawPlaceholder',
          data: { placeholder: match[0] }
        });
      }
    };
  }
};
