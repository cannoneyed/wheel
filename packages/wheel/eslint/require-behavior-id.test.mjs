/**
 * wheel/require-behavior-id regressions: every demo browser test names an
 * existing behavior-spec row. Uses the real packages/demos/specs table —
 * KANBAN-05 is a permanent id (spec ids are never renumbered or reused), so
 * these fixtures are stable by the spec system's own contract.
 */
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import wheel from './index.mjs';

const linter = new Linter({ configType: 'flat' });

const SPEC_FILE = 'packages/demos/browser/sample.spec.ts';

function verify(code, filename = SPEC_FILE) {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
        plugins: { wheel },
        rules: { 'wheel/require-behavior-id': 'error' }
      }
    ],
    { filename }
  );
}

const ids = (messages) => messages.map((message) => message.messageId ?? message.ruleId);

describe('require-behavior-id', () => {
  it('accepts an annotated behavior() with a matching, existing id', () => {
    expect(verify(`// behavior: KANBAN-05\nbehavior('KANBAN-05', 't', async () => {});`)).toEqual([]);
  });

  it('accepts an annotated raw test()', () => {
    expect(verify(`// behavior: KANBAN-05\ntest('t', async () => {});`)).toEqual([]);
  });

  it('accepts annotations inside describe blocks and ignores test.use/describe', () => {
    expect(
      verify(`test.use({ video: 'on' });\ntest.describe('x', () => {\n// behavior: KANBAN-05\ntest('y', async () => {});\n});`)
    ).toEqual([]);
  });

  it('rejects a behavior() or test() with no annotation', () => {
    expect(ids(verify(`behavior('KANBAN-05', 't', async () => {});`))).toEqual(['missingComment']);
    expect(ids(verify(`test('t', async () => {});`))).toEqual(['missingComment']);
  });

  it('rejects ids that are in no spec file', () => {
    expect(ids(verify(`// behavior: KANBAN-9999\nbehavior('KANBAN-9999', 't', async () => {});`))).toEqual([
      'unknownId'
    ]);
    expect(ids(verify(`// behavior: NOPE-01\ntest('t', async () => {});`))).toEqual(['unknownId']);
  });

  it('rejects comment/argument mismatch and computed ids', () => {
    expect(ids(verify(`// behavior: KANBAN-05\nbehavior('KANBAN-01', 't', async () => {});`))).toEqual([
      'idMismatch'
    ]);
    expect(ids(verify(`// behavior: KANBAN-05\nbehavior(id, 't', async () => {});`))).toEqual(['nonLiteralId']);
  });

  it('governs only browser spec files', () => {
    expect(verify(`test('t', async () => {});`, 'packages/demos/browser/support/helpers.ts')).toEqual([]);
    expect(verify(`test('t', async () => {});`, 'packages/demos/src/todos/todos.test.ts')).toEqual([]);
  });
});
