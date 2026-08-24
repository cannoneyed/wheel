import { describe, expect, test } from 'vitest';
import { RowValidationError, t, validateRow } from './schema';

const TodoRow = t.object({
  id: t.string(),
  listId: t.string(),
  done: t.boolean()
});

describe('validateRow (the server boundary net)', () => {
  test('valid rows pass through', () => {
    const row = { id: 'todo_1', listId: 'l_1', done: false };
    expect(validateRow('query todos.byList', TodoRow, row)).toEqual(row);
  });

  test('snake_case drift fails loudly, naming source and column', () => {
    // The classic: SQL forgot `list_id as "listId"`.
    const drifted = { id: 'todo_1', list_id: 'l_1', done: false };
    try {
      validateRow('query todos.byList', TodoRow, drifted);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RowValidationError);
      const validation = error as RowValidationError;
      expect(validation.source).toBe('query todos.byList');
      expect(validation.message).toContain('todos.byList');
      expect(validation.message).toContain('listId');
    }
  });

  test('type drift fails loudly', () => {
    expect(() => validateRow('query todos.byList', TodoRow, { id: 'x', listId: 'l', done: 'yes' })).toThrow(
      RowValidationError
    );
  });

  test('rejects values that Zod accepts but JSON cannot round-trip', () => {
    const JsonHostileRow = t.object({
      id: t.string(),
      value: t.unknown()
    });

    expect(() => validateRow('query records.all', JsonHostileRow, { id: 'r1', value: 42n })).toThrow(
      /value: bigint is not JSON/
    );
    expect(() => validateRow('query records.all', JsonHostileRow, { id: 'r1', value: Number.NaN })).toThrow(
      /value: non-finite number NaN/
    );
    expect(() => validateRow('query records.all', JsonHostileRow, { id: 'r1', value: new Date(0) })).toThrow(
      /value: class instances are not data \(Date\)/
    );
  });
});
