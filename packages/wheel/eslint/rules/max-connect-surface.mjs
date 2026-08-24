/**
 * No super components — as a lint failure, not a review comment.
 *
 * Caps a connect() declaration at `maxFields` returned fields and
 * `maxServices` distinct c.service(...) resolutions. A component that needs
 * more must split, or carry an explicit
 * `// wheel-connect-surface: <reason>` comment directly above the connect call
 * — making every exception greppable and reviewable.
 */
const DEFAULTS = { maxFields: 12, maxServices: 3 };

function findReturnedObject(fn) {
  if (fn.body.type === 'ObjectExpression') return fn.body;
  if (fn.body.type !== 'BlockStatement') return null;
  for (const statement of fn.body.body) {
    if (statement.type === 'ReturnStatement' && statement.argument?.type === 'ObjectExpression') {
      return statement.argument;
    }
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'cap the size of a connect() declaration (fields and services)' },
    messages: {
      tooManyFields:
        "connect('{{name}}') returns {{count}} fields (max {{max}}). Split the component, or justify with a `// wheel-connect-surface: <reason>` comment above the connect call.",
      tooManyServices:
        "connect('{{name}}') touches {{count}} services (max {{max}}). Split the component, or justify with a `// wheel-connect-surface: <reason>` comment above the connect call."
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxFields: { type: 'integer', minimum: 1 },
          maxServices: { type: 'integer', minimum: 1 }
        },
        additionalProperties: false
      }
    ]
  },
  create(context) {
    const options = { ...DEFAULTS, ...(context.options[0] ?? {}) };
    const source = context.sourceCode;

    function hasEscapePragma(node) {
      const comments = source.getCommentsBefore(node);
      return comments.some((comment) => comment.value.includes('wheel-connect-surface:'));
    }

    return {
      CallExpression(node) {
        if (node.callee?.name !== 'connect' || node.arguments.length < 2) return;
        const [nameArg, declareArg] = node.arguments;
        if (declareArg.type !== 'ArrowFunctionExpression' && declareArg.type !== 'FunctionExpression') return;
        if (hasEscapePragma(node)) return;
        const componentName = nameArg.type === 'Literal' ? String(nameArg.value) : '<connect>';

        const returned = findReturnedObject(declareArg);
        if (returned) {
          const fieldCount = returned.properties.length;
          if (fieldCount > options.maxFields) {
            context.report({
              node: returned,
              messageId: 'tooManyFields',
              data: { name: componentName, count: String(fieldCount), max: String(options.maxFields) }
            });
          }
        }

        // Count distinct c.service(X) resolutions inside the declaration.
        const services = new Set();
        const visit = (current) => {
          if (!current || typeof current.type !== 'string') return;
          if (
            current.type === 'CallExpression' &&
            current.callee?.type === 'MemberExpression' &&
            current.callee.property?.name === 'service' &&
            current.arguments[0]?.type === 'Identifier'
          ) {
            services.add(current.arguments[0].name);
          }
          for (const key of Object.keys(current)) {
            if (key === 'parent') continue;
            const value = current[key];
            if (Array.isArray(value)) {
              for (const item of value) visit(item);
            } else if (value && typeof value === 'object' && typeof value.type === 'string') {
              visit(value);
            }
          }
        };
        visit(declareArg.body);
        if (services.size > options.maxServices) {
          context.report({
            node: declareArg,
            messageId: 'tooManyServices',
            data: { name: componentName, count: String(services.size), max: String(options.maxServices) }
          });
        }
      }
    };
  }
};
