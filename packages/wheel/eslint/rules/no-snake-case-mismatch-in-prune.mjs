/**
 * WHY THIS RULE EXISTS
 *
 * A query handler's `prune` callback is handed the RAW database row — the
 * actual table columns, `issue_id`, `user_id`, `created_at`. Every OTHER row
 * you touch in that same file is the projected row, where the SQL has already
 * aliased those to `issueId`, `userId`, `createdAt`. So the camelCase name is
 * the one your fingers know, and typing it in `prune` compiles, typechecks,
 * and is wrong:
 *
 *   ❌ prune: (image, params) => image.n?.issueId === params.issueId
 *   ✅ prune: (image, params) => (image.n?.issue_id ?? image.o?.issue_id) === params.issueId
 *
 * `image.n.issueId` is `undefined` on every row, so the predicate is `false`
 * for every row, so the engine concludes NO write can ever affect this query
 * — and the subscription silently stops updating. Nothing throws. Nothing
 * logs. The query just goes stale: comments stop appearing, the activity feed
 * freezes, and it looks like a sync bug anywhere but here. `RowImage.o` / `.n`
 * are typed `Record<string, unknown>`, so TypeScript is no help at all — any
 * property name is legal on them.
 *
 * This bit for real this week. The whole rule is: inside `prune`, a property
 * read off the image's `.n` or `.o` may not contain an uppercase letter.
 *
 * SCOPE: `*.server.ts` files only (where `serveQuery` handlers live). The
 * callback's image parameter is bound by position, whatever it is named, and
 * the destructured form (`prune: ({ n, o }, params) => …`) is bound too.
 *
 * ESCAPE HATCH: `// wheel-db-column: <reason>` (20+ chars) on the line above,
 * for the rare SQLite table that has a quoted camelCase column. The reason must
 * explain the schema choice.
 */

/** The image fields holding a raw row: before (`o`) and after (`n`). */
const IMAGE_ROW_FIELDS = new Set(['o', 'n']);

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'a prune callback reads RAW snake_case table columns off image.n/image.o — a camelCase name is always undefined and silently freezes the query'
    },
    messages: {
      camelCaseColumn:
        '`{{access}}` reads a camelCase name off a RAW database row — those columns are snake_case (`{{suggestion}}`), so this is `undefined` on every row, the predicate is always false, and the subscription silently stops updating. Use the real column name. A genuinely quoted camelCase column escapes with `// wheel-db-column: <reason>` above the line.'
    },
    schema: []
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!/\.server\.ts$/.test(filename)) return {};

    /** Every line a substantive `wheel-db-column:` reason covers. */
    const excusedLines = new Set();
    for (const comment of context.sourceCode.getAllComments()) {
      if (/wheel-db-column:\s+\S.{19,}/s.test(comment.value)) {
        excusedLines.add(comment.loc.end.line + 1);
        excusedLines.add(comment.loc.end.line);
      }
    }

    /**
     * Identifiers that currently denote a raw row inside a prune callback.
     * Two shapes are bound: the image param itself (reads are `image.n.x`) and,
     * for a destructured param, the locals standing in for `n` / `o`.
     */
    const imageParams = [];
    const rowLocals = [];
    /** One frame per prune callback currently being walked, for exact unwinding. */
    const scopes = [];

    /** snake_case suggestion for a camelCase property, for the message. */
    function toSnake(name) {
      return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    }

    function isCamel(name) {
      return /[A-Z]/.test(name);
    }

    function reportProperty(node, propertyNode, access) {
      if (excusedLines.has(node.loc.start.line)) return;
      context.report({
        node: propertyNode,
        messageId: 'camelCaseColumn',
        data: { access, suggestion: toSnake(propertyNode.name) }
      });
    }

    /** `prune: (image, …) => …` / `prune(image, …) { … }` — the callback, or null. */
    function pruneCallback(node) {
      if (node.computed) return null;
      const key = node.key;
      const name =
        key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : null;
      if (name !== 'prune') return null;
      if (node.type === 'MethodDefinition' || node.method) return node.value;
      const value = node.value;
      return value && (value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression')
        ? value
        : null;
    }

    function enter(node) {
      const callback = pruneCallback(node);
      if (!callback) return;
      scopes.push({ node, imageParams: imageParams.length, rowLocals: rowLocals.length });
      const param = callback.params[0];
      if (!param) return;
      if (param.type === 'Identifier') {
        imageParams.push(param.name);
      } else if (param.type === 'ObjectPattern') {
        for (const property of param.properties) {
          if (
            property.type === 'Property' &&
            !property.computed &&
            property.key.type === 'Identifier' &&
            IMAGE_ROW_FIELDS.has(property.key.name) &&
            property.value.type === 'Identifier'
          ) {
            rowLocals.push(property.value.name);
          }
        }
      }
    }

    function exit(node) {
      if (scopes.at(-1)?.node !== node) return;
      const scope = scopes.pop();
      imageParams.length = scope.imageParams;
      rowLocals.length = scope.rowLocals;
    }

    return {
      Property: enter,
      'Property:exit': exit,
      MethodDefinition: enter,
      'MethodDefinition:exit': exit,
      MemberExpression(node) {
        if (imageParams.length === 0 && rowLocals.length === 0) return;
        if (node.computed || node.property.type !== 'Identifier') return;
        if (!isCamel(node.property.name)) return;

        const object = node.object;
        // `image.n.issueId` / `image.n?.issueId`
        if (
          object.type === 'MemberExpression' &&
          !object.computed &&
          object.property.type === 'Identifier' &&
          IMAGE_ROW_FIELDS.has(object.property.name) &&
          object.object.type === 'Identifier' &&
          imageParams.includes(object.object.name)
        ) {
          reportProperty(
            node,
            node.property,
            `${object.object.name}.${object.property.name}.${node.property.name}`
          );
          return;
        }
        // Destructured: `n?.issueId`
        if (object.type === 'Identifier' && rowLocals.includes(object.name)) {
          reportProperty(node, node.property, `${object.name}.${node.property.name}`);
        }
      }
    };
  }
};
