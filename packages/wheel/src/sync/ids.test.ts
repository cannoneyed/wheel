import { describe, expect, test } from 'vitest';
import { createIdGen, fixedClock, idTimestamp, isValidId, seededRandomBytes } from './ids';

const testGen = (start = 1_700_000_000_000, step = 0) =>
  createIdGen({ clock: fixedClock(start, step), randomBytes: seededRandomBytes(0xc0ffee) });

describe('prefixed UUIDv7 ids', () => {
  test('produces valid prefixed UUIDv7s', () => {
    const id = testGen().newId('todo');
    expect(isValidId(id)).toBe(true);
    expect(isValidId(id, 'todo')).toBe(true);
    expect(isValidId(id, 'issue')).toBe(false);
    expect(id).toMatch(/^todo_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('embeds the clock timestamp', () => {
    const start = 1_700_000_000_000;
    expect(idTimestamp(testGen(start).newId('todo'))).toBe(start);
  });

  test('ids within one millisecond are monotonic', () => {
    const gen = testGen(1_700_000_000_000, 0); // clock never advances
    const ids = Array.from({ length: 100 }, () => gen.newId('todo'));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(100);
  });

  test('deterministic: same seed + clock → same ids', () => {
    const a = testGen();
    const b = testGen();
    expect(a.newId('todo')).toBe(b.newId('todo'));
    expect(a.newId('todo')).toBe(b.newId('todo'));
  });

  test('rejects invalid prefixes', () => {
    const gen = testGen();
    expect(() => gen.newId('Todo')).toThrow(/prefix/);
    expect(() => gen.newId('to-do')).toThrow(/prefix/);
    expect(() => gen.newId('')).toThrow(/prefix/);
  });

  test('isValidId rejects lookalikes', () => {
    expect(isValidId('todo_not-a-uuid')).toBe(false);
    expect(isValidId('todo_0190b62e-0000-4000-8000-000000000000')).toBe(false); // v4, not v7
    expect(idTimestamp('garbage')).toBeNull();
  });
});
