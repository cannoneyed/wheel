/**
 * WHY THIS RULE EXISTS (mount-order ids make agents flaky):
 *
 * Instance ids come from the connect name. A STATIC name gives repeated
 * mounts positional ids — `TodoRow`, `TodoRow#2`, `TodoRow#3` — which depend
 * on mount ORDER: reorder the list and `TodoRow#2` silently becomes a
 * different row. Any agent script, playwright selector, or debug-panel deep
 * link addressing `TodoRow#2` is now wrong, with no error anywhere.
 *
 * The fix already exists: the per-instance name form derives the id from the
 * entity the component renders, so the id follows the DATA, not the mount
 * order:
 *
 *   connect('TodoRow', (c, props) => ... props.todoId ...)          // ❌ positional ids
 *   connect((props) => `TodoRow:${props.todoId}`, (c, props) => …)  // ✅ `TodoRow:42`, stable forever
 *
 * This rule detects the tell: a connect declaration with a STATIC name whose
 * declare callback reads an identity prop (`props.id` or `props.*Id`). A
 * component whose declaration reads an entity id is per-entity by
 * definition — its instances deserve per-entity ids.
 *
 * Escape hatch for the true singletons (an id-taking component that can only
 * ever mount once): `// wheel-stable-instance-name: <reason>`.
 */
const IDENTITY_PROP = /^(id|.*Id)$/;

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'connect declarations that read identity props use per-instance names (stable data-derived ids, not mount-order ids)'
    },
    messages: {
      staticName:
        "connect('{{name}}') reads `props.{{prop}}` but uses a static name, so repeated mounts get mount-order ids ({{name}}#2, …) that shift when lists reorder. Use the per-instance form: connect((props) => `{{name}}:${props.{{prop}}}`, …) — or explain with `// wheel-stable-instance-name: <reason>`."
    },
    schema: []
  },
  create(context) {
    if (/\.test\.(ts|tsx)$/.test(context.filename)) {
      return {};
    }
    if (/wheel-stable-instance-name:/.test(context.sourceCode.getText())) {
      return {};
    }
    return {
      CallExpression(node) {
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'connect') return;
        const [nameArg, declareArg] = node.arguments;
        if (!nameArg || nameArg.type !== 'Literal' || typeof nameArg.value !== 'string') return;
        if (!declareArg || (declareArg.type !== 'ArrowFunctionExpression' && declareArg.type !== 'FunctionExpression')) return;
        const propsParam = declareArg.params[1];
        if (!propsParam) return;

        // props may be a plain identifier (`props.cardId`) or a destructure
        // pattern (`{ cardId }`). Collect the identity-prop reads either way.
        let found = null;
        if (propsParam.type === 'Identifier') {
          const propsName = propsParam.name;
          const visit = (n) => {
            if (!n || typeof n.type !== 'string' || found) return;
            if (
              n.type === 'MemberExpression' &&
              n.object?.type === 'Identifier' &&
              n.object.name === propsName &&
              !n.computed &&
              n.property?.type === 'Identifier' &&
              IDENTITY_PROP.test(n.property.name)
            ) {
              found = n.property.name;
              return;
            }
            for (const key of Object.keys(n)) {
              if (key === 'parent') continue;
              const child = n[key];
              if (Array.isArray(child)) child.forEach(visit);
              else if (child && typeof child.type === 'string') visit(child);
            }
          };
          visit(declareArg.body);
        } else if (propsParam.type === 'ObjectPattern') {
          for (const property of propsParam.properties) {
            if (
              property.type === 'Property' &&
              property.key?.type === 'Identifier' &&
              IDENTITY_PROP.test(property.key.name)
            ) {
              found = property.key.name;
              break;
            }
          }
        }
        if (found) {
          context.report({
            node: nameArg,
            messageId: 'staticName',
            data: { name: nameArg.value, prop: found }
          });
        }
      }
    };
  }
};
