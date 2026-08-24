/**
 * WHY THIS RULE EXISTS
 *
 * A service used 33 hand-written epoch checks to stop old async work:
 *
 *   const epoch = ++this.airEpoch;
 *   const value = await load();
 *   if (epoch !== this.airEpoch) return; // easy to miss after the next await
 *
 * `this.latestAsyncTask()` replaces the counter. Its `wait` method rejects as soon as
 * a newer task starts, so the stale continuation cannot change state:
 *
 *   const task = this.latestAsyncTask();
 *   const value = await task.wait(load()); // checked on every await
 *
 * One bare await removes that protection from the rest of the chain. This
 * rule reports the exact bare await. It applies only after a service method
 * opts in with `this.latestAsyncTask()`; ordinary async methods keep their meaning.
 */

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration'
]);

/** Child nodes of one ESTree node. */
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

/** Remove TypeScript wrappers around one value expression. */
function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ChainExpression')
  ) {
    current = current.expression;
  }
  return current;
}

/** True for `this.latestAsyncTask()`. */
function isLatestAsyncTaskCall(node) {
  const call = unwrap(node);
  const callee = unwrap(call?.callee);
  return (
    call?.type === 'CallExpression' &&
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'ThisExpression' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'latestAsyncTask'
  );
}

/** The simple name at the end of one superclass expression. */
function superclassName(node) {
  const value = unwrap(node);
  if (value?.type === 'Identifier') return value.name;
  if (value?.type === 'MemberExpression' && !value.computed && value.property.type === 'Identifier') {
    return value.property.name;
  }
  return null;
}

/** True for a class declared as a Service or SyncService subclass. */
function isServiceClass(node) {
  const name = superclassName(node?.superClass);
  return name !== null && name.endsWith('Service');
}

/**
 * Return the service class for one direct method, field callback, or action
 * callback. A nested function returns null and is analyzed with its parent.
 */
function directServiceClass(fn) {
  let current = fn.parent;
  while (current) {
    if (FUNCTION_TYPES.has(current.type)) return null;
    if (current.type === 'MethodDefinition' || current.type === 'PropertyDefinition') {
      const classNode = current.parent?.parent;
      return isServiceClass(classNode) ? classNode : null;
    }
    if (current.type === 'ClassDeclaration' || current.type === 'ClassExpression') return null;
    current = current.parent;
  }
  return null;
}

/** Add plain identifier bindings from a parameter or declaration pattern. */
function addBindings(node, names) {
  if (!node) return;
  if (node.type === 'Identifier') {
    names.add(node.name);
    return;
  }
  if (node.type === 'RestElement') {
    addBindings(node.argument, names);
    return;
  }
  if (node.type === 'AssignmentPattern') {
    addBindings(node.left, names);
    return;
  }
  if (node.type === 'ArrayPattern') {
    for (const element of node.elements) addBindings(element, names);
    return;
  }
  if (node.type === 'ObjectPattern') {
    for (const property of node.properties) {
      addBindings(property.type === 'Property' ? property.value : property.argument, names);
    }
  }
}

/** True when an awaited expression includes `<token>.wait(...)`. */
function includesLatestAsyncTaskWait(node, tokenNames) {
  let found = false;
  const scan = (current) => {
    if (found || !current) return;
    if (FUNCTION_TYPES.has(current.type)) return;
    if (current.type === 'CallExpression') {
      const callee = unwrap(current.callee);
      if (callee?.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
        const object = unwrap(callee.object);
        if (
          callee.property.name === 'wait' &&
          ((object?.type === 'Identifier' && tokenNames.has(object.name)) || isLatestAsyncTaskCall(object))
        ) {
          found = true;
          return;
        }
      }
    }
    for (const child of children(current)) scan(child);
  };
  scan(node);
  return found;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'every await in a latest async task uses the token wait method'
    },
    messages: {
      uncheckedAwait:
        'This service method opened `this.latestAsyncTask()`, but this await does not check that token. Wrap the awaited work with `{{token}}.wait(...)` so a newer task stops this continuation.'
    },
    schema: []
  },
  create(context) {
    const analyzeFunction = (fn, inheritedTokens = new Set(), inheritedTask = false) => {
      const declared = new Set();
      const localTokens = new Set();
      const awaits = [];
      const nested = [];
      let opensTask = false;

      for (const parameter of fn.params ?? []) addBindings(parameter, declared);

      const scanOwn = (node) => {
        if (!node) return;
        if (node !== fn && FUNCTION_TYPES.has(node.type)) {
          nested.push(node);
          return;
        }
        if (node.type === 'VariableDeclarator') {
          addBindings(node.id, declared);
          if (node.id.type === 'Identifier' && isLatestAsyncTaskCall(node.init)) {
            localTokens.add(node.id.name);
          }
        }
        if (isLatestAsyncTaskCall(node)) opensTask = true;
        if (node.type === 'AwaitExpression') awaits.push(node);
        for (const child of children(node)) scanOwn(child);
      };
      scanOwn(fn.body);

      const tokens = new Set(inheritedTokens);
      for (const name of declared) tokens.delete(name);
      for (const name of localTokens) tokens.add(name);
      const hasTask = inheritedTask || opensTask;
      const token = [...tokens][0] ?? 'task';

      if (hasTask) {
        for (const awaitNode of awaits) {
          if (!includesLatestAsyncTaskWait(awaitNode.argument, tokens)) {
            context.report({ node: awaitNode, messageId: 'uncheckedAwait', data: { token } });
          }
        }
      }

      for (const child of nested) analyzeFunction(child, tokens, hasTask);
    };

    const analyzeDirect = (node) => {
      if (directServiceClass(node)) analyzeFunction(node);
    };

    return {
      'ArrowFunctionExpression:exit': analyzeDirect,
      'FunctionExpression:exit': analyzeDirect,
      'FunctionDeclaration:exit': analyzeDirect
    };
  }
};
