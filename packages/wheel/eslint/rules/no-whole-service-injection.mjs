/**
 * AGENTS.md rule 3 (extended): a connect() declaration injects DATA as values
 * and ACTIONS as bound functions — never a whole service instance. Whole
 * services make components hard to mock (Storybook needs the full class) and
 * blur the manifest: the declaration should name exactly what the component
 * uses.
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'connect() must not inject whole service instances' },
    messages: {
      wholeService:
        'connect() injects the whole service "{{name}}". Inject the specific values and bound actions the component uses (AGENTS.md rule 3).'
    },
    schema: []
  },
  create(context) {
    const source = context.sourceCode;

    function insideConnect(node) {
      let current = node.parent;
      while (current) {
        if (current.type === 'CallExpression' && current.callee?.name === 'connect') return true;
        current = current.parent;
      }
      return false;
    }

    function isServiceCall(node) {
      return (
        node?.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        node.callee.property?.name === 'service'
      );
    }

    function variableInit(identifier, fromNode) {
      let scope = source.getScope(fromNode);
      while (scope) {
        const variable = scope.variables.find((candidate) => candidate.name === identifier.name);
        const definition = variable?.defs[0];
        if (definition?.node?.type === 'VariableDeclarator') {
          return definition.node.init;
        }
        scope = scope.upper;
      }
      return null;
    }

    function isWholeService(node, fromNode, seen = new Set()) {
      if (isServiceCall(node)) return true;
      if (node?.type !== 'Identifier' || seen.has(node.name)) return false;
      seen.add(node.name);
      const init = variableInit(node, fromNode);
      return init ? isWholeService(init, fromNode, seen) : false;
    }

    function resolveObject(node, fromNode, seen = new Set()) {
      if (node?.type === 'ObjectExpression') return node;
      if (node?.type !== 'Identifier' || seen.has(node.name)) return null;
      seen.add(node.name);
      const init = variableInit(node, fromNode);
      return init ? resolveObject(init, fromNode, seen) : null;
    }

    function serviceLabel(node) {
      if (isServiceCall(node)) return node.arguments[0]?.name ?? '?';
      return node?.type === 'Identifier' ? node.name : '?';
    }

    function inspectBag(node, fromNode) {
      const object = resolveObject(node, fromNode);
      if (!object) return;
      for (const property of object.properties) {
        const value = property.type === 'Property' ? property.value : property.argument;
        if (!isWholeService(value, fromNode)) continue;
        context.report({
          node: property,
          messageId: 'wholeService',
          data: { name: serviceLabel(value) }
        });
      }
    }

    return {
      ReturnStatement(node) {
        if (!node.argument || node.argument.type !== 'ObjectExpression' || !insideConnect(node)) return;
        inspectBag(node.argument, node);
      },
      // Arrow-body form: connect('X', (c) => ({ board: c.service(BoardService) }))
      ArrowFunctionExpression(node) {
        if (node.body.type !== 'ObjectExpression' || !insideConnect(node.body)) return;
        inspectBag(node.body, node);
      },
      CallExpression(node) {
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'view' || !insideConnect(node)) {
          return;
        }
        for (const bag of node.arguments.slice(0, 2)) {
          if (bag.type !== 'SpreadElement') inspectBag(bag, node);
        }
      }
    };
  }
};
