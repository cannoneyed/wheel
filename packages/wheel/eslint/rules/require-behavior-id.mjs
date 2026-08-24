/**
 * WHY THIS RULE EXISTS
 *
 * A user moved a kanban card between columns on the live site and the page
 * crashed — the demo browser suite was green, because the behavior lived in
 * nobody's head and therefore in no test. Task 016's answer is a contract
 * chain: every demo behavior is a row with a permanent id in
 * packages/demos/specs/*.md, and every browser test names the row it proves.
 * A test without a spec id is coverage nobody can audit; an id that names no
 * spec row is a link to nothing. Both drift silently — so both are build
 * failures.
 *
 *   ❌ test('moving a card works', async ({ page }) => { … })
 *      // no behavior id — which spec row does this prove?
 *
 *   ❌ // behavior: KANBAN-99
 *      behavior('KANBAN-99', 'ghost row', …)   // KANBAN-99 is in no spec file
 *
 *   ✅ // behavior: KANBAN-05
 *      behavior('KANBAN-05', 'a moved card keeps its menu', …)
 *
 *   ✅ // behavior: SHELL-03
 *      test('survives a cold load of a deep URL', …)
 *
 * The behavior() harness (browser/support/behaviors.ts) needs BOTH the
 * comment and the matching literal first argument — the comment is what the
 * completeness test and human readers grep for; the argument is what names
 * the recording. Raw test() calls (legacy/regression suites) need the
 * comment alone. The reverse direction — every spec row has at least one
 * test — is the specs-coverage vitest suite, not this rule: lint is
 * single-file, completeness is repo-wide.
 *
 * SCOPE: packages/demos/browser/*.spec.ts. Support files, configs, and unit
 * tests are not governed.
 *
 * ESCAPE HATCH: none. A browser test that genuinely proves no spec'd
 * behavior means the spec table is missing a row — add the row.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

const ID_PATTERN = /^[A-Z]+-\d{2,}$/;
// The PRIMARY id leads; free text after it may name secondary rows the test
// also proves: `// behavior: ROUTING-04 (also SHELL-03: cold load)`.
const COMMENT_PATTERN = /^\s*behavior:\s*([A-Z]+-\d{2,})\b/;

/** Cache of spec ids per specs-directory path (one read per lint run). */
const specIdsCache = new Map();

function specIdsFor(specsDir) {
  const cached = specIdsCache.get(specsDir);
  if (cached) return cached;
  const ids = new Set();
  if (existsSync(specsDir)) {
    for (const name of readdirSync(specsDir)) {
      if (!name.endsWith('.md')) continue;
      const text = readFileSync(join(specsDir, name), 'utf8');
      for (const match of text.matchAll(/([A-Z]+-\d{2,})/g)) {
        ids.add(match[1]);
      }
    }
  }
  specIdsCache.set(specsDir, ids);
  return ids;
}

/** Walk up from the spec file to the demos package root (which holds specs/). */
function findSpecsDir(filename) {
  let dir = dirname(filename);
  for (let hops = 0; hops < 6; hops += 1) {
    if (dir.endsWith(`${sep}browser`)) {
      return resolve(dir, '../specs');
    }
    dir = dirname(dir);
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'every demo browser test carries a `// behavior: <ID>` comment naming an existing spec row in packages/demos/specs/'
    },
    messages: {
      missingComment:
        'This {{kind}} has no `// behavior: <DEMO>-<NN>` comment above it. Every demo browser test proves a spec row (packages/demos/specs/) and must name it.',
      unknownId:
        "behavior id '{{id}}' is not in any packages/demos/specs/*.md file. Add the spec row first — the spec is the contract, the test proves it.",
      idMismatch:
        "the comment says '{{commentId}}' but behavior() is called with '{{argId}}'. The comment, the argument, and the spec row must agree.",
      nonLiteralId:
        'behavior() needs a literal string id (e.g. KANBAN-05) — a computed id cannot be audited against the spec table.'
    },
    schema: []
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!/[\\/]browser[\\/][^\\/]+\.spec\.ts$/.test(filename)) {
      return {};
    }
    const specsDir = findSpecsDir(filename);
    const specIds = specsDir ? specIdsFor(specsDir) : new Set();
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /** The `// behavior: X` comment immediately above a statement, if any. */
    function behaviorCommentBefore(node) {
      let target = node;
      // Climb to the enclosing statement so comments above `test(...)` inside
      // an expression statement are found.
      while (target.parent && target.parent.type === 'ExpressionStatement') {
        target = target.parent;
      }
      const comments = sourceCode.getCommentsBefore(target);
      for (let i = comments.length - 1; i >= 0; i -= 1) {
        const match = COMMENT_PATTERN.exec(comments[i].value);
        if (match) return match[1];
      }
      return null;
    }

    function calleeRootName(callee) {
      if (callee.type === 'Identifier') return callee.name;
      if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier') {
        // test.describe / test.use / test.skip … — only bare `test(…)` and
        // `test.only/fixme(…)` declare a runnable test.
        const property = callee.property;
        const propertyName = property.type === 'Identifier' ? property.name : null;
        if (callee.object.name === 'test' && (propertyName === 'only' || propertyName === 'fixme')) {
          return 'test';
        }
        return null;
      }
      return null;
    }

    return {
      CallExpression(node) {
        const name = calleeRootName(node.callee);
        if (name !== 'behavior' && name !== 'test') return;
        const commentId = behaviorCommentBefore(node);
        if (name === 'behavior') {
          const first = node.arguments[0];
          if (!first || first.type !== 'Literal' || typeof first.value !== 'string') {
            context.report({ node, messageId: 'nonLiteralId' });
            return;
          }
          const argId = first.value;
          if (!commentId) {
            context.report({ node, messageId: 'missingComment', data: { kind: 'behavior()' } });
            return;
          }
          if (commentId !== argId) {
            context.report({ node, messageId: 'idMismatch', data: { commentId, argId } });
            return;
          }
          if (ID_PATTERN.test(argId) && !specIds.has(argId)) {
            context.report({ node, messageId: 'unknownId', data: { id: argId } });
          }
          return;
        }
        // Raw test(): the comment alone links it.
        if (!commentId) {
          context.report({ node, messageId: 'missingComment', data: { kind: 'test()' } });
          return;
        }
        if (!specIds.has(commentId)) {
          context.report({ node, messageId: 'unknownId', data: { id: commentId } });
        }
      }
    };
  }
};
