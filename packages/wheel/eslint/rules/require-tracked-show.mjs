/**
 * WHY THIS RULE EXISTS (the component that vanished for no stated reason):
 *
 * A component whose root is a falsy `<Show>` renders NO DOM. So does a
 * deliberately headless component. So does one whose author forgot
 * `use:componentRoot`. In the debug tree all three looked the same — the
 * component sat there claiming to be mounted with nothing on screen — and
 * only the first is normal, expected behavior:
 *
 *   import { Show } from 'solid-js';   // ❌ tree says "⊘ no DOM": bug or by design?
 *   import { Show } from 'wheel/core'; // ✅ tree says "⊘ hidden": a condition said no
 *
 * wheel's `<Show>` is a drop-in for Solid's — same props, same generics —
 * that additionally reports its condition to the instance registry. The
 * pain of NOT using it shows up far from the import: someone debugging a
 * missing button can't tell whether they're looking at a feature or a
 * failure, which is exactly the question the component tree exists to
 * answer.
 *
 * Scope, deliberately narrow: only a `<Show>` in a component's ROOT
 * position — the one whose condition decides whether the component appears
 * at all. A `<Show>` deeper in a tree hides part of a component that is
 * itself visible, which the tree already shows correctly, so those keep
 * using Solid's import with no ceremony.
 *
 * Escape hatch: `// wheel-untracked-show: <reason>` in the file.
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "a component whose root output is <Show> imports it from 'wheel/core', so the debug tree can say 'hidden' instead of 'no DOM'"
    },
    messages: {
      untracked:
        "This component's root is a <Show> imported from 'solid-js', so when it renders nothing the debug tree cannot tell 'hidden by a condition' from 'broken'. Import { Show } from 'wheel/core' (drop-in, same props), or explain with `// wheel-untracked-show: <reason>`."
    },
    schema: []
  },
  create(context) {
    const filename = context.filename;
    if (/\.test\.(ts|tsx)$/.test(filename) || /\.states\.tsx$/.test(filename)) {
      return {};
    }
    const source = context.sourceCode.getText();
    if (/wheel-untracked-show:/.test(source)) return {};
    // wheel's own Show implementation necessarily wraps Solid's.
    if (/packages\/wheel\/src\/core\/visibility\.tsx$/.test(filename.replace(/\\/g, '/'))) return {};

    /** Local names for `Show` that came from solid-js. */
    const solidShowNames = new Set();
    /** Root-position <Show> JSX nodes, checked at Program:exit. */
    const rootShows = [];

    /** The JSX element a component function ultimately returns, if it is one. */
    function returnedJsx(node) {
      const body = node.body;
      if (body?.type === 'JSXElement') return body;
      if (body?.type !== 'BlockStatement') return null;
      for (let index = body.body.length - 1; index >= 0; index -= 1) {
        const statement = body.body[index];
        if (statement.type === 'ReturnStatement') {
          const argument = statement.argument;
          // `return (<Show …/>)` — parenthesized expressions are transparent here.
          return argument?.type === 'JSXElement' ? argument : null;
        }
      }
      return null;
    }

    function isComponent(node) {
      if (node.type === 'FunctionDeclaration' && node.id && /^[A-Z]/.test(node.id.name)) return true;
      return (
        (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') &&
        node.parent?.type === 'VariableDeclarator' &&
        node.parent.id?.type === 'Identifier' &&
        /^[A-Z]/.test(node.parent.id.name)
      );
    }

    // Collect EVERY root-position element; the solid-vs-wheel decision waits
    // for Program:exit, when the import list is complete. Matching on the
    // LOCAL name also catches `import { Show as S }`.
    function checkComponent(node) {
      if (!isComponent(node)) return;
      const root = returnedJsx(node);
      const name = root?.openingElement?.name;
      if (name?.type === 'JSXIdentifier') {
        rootShows.push(root.openingElement);
      }
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'solid-js') return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && specifier.imported?.name === 'Show') {
            solidShowNames.add(specifier.local.name);
          }
        }
      },
      FunctionDeclaration: checkComponent,
      ArrowFunctionExpression: checkComponent,
      FunctionExpression: checkComponent,
      'Program:exit'() {
        if (solidShowNames.size === 0) return;
        for (const opening of rootShows) {
          if (solidShowNames.has(opening.name.name)) {
            context.report({ node: opening, messageId: 'untracked' });
          }
        }
      }
    };
  }
};
