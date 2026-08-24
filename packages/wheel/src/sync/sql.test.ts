import { describe, expect, test } from 'vitest';
import { compileSql, sql, isSqlFragment } from './sql';

describe('sql descriptor', () => {
  test('parameterizes interpolated values for SQLite', () => {
    const fragment = sql`select * from todos where list_id = ${'l_1'} and done = ${false}`;
    expect(compileSql(fragment)).toEqual({
      text: 'select * from todos where list_id = ? and done = ?',
      params: ['l_1', false]
    });
  });

  test('composes nested fragments in parameter order', () => {
    const filter = sql`list_id = ${'l_1'} and done = ${true}`;
    const outer = sql`select * from todos where ${filter} order by position limit ${10}`;
    expect(compileSql(outer)).toEqual({
      text: 'select * from todos where list_id = ? and done = ? order by position limit ?',
      params: ['l_1', true, 10]
    });
  });

  test('literal placeholder text is never changed', () => {
    const inner = sql`name = ${'x'}`;
    const outer = sql`select '$1 costs $2', '? maybe' from t where ${inner} and other = ${'y'}`;
    expect(compileSql(outer).text).toBe(
      `select '$1 costs $2', '? maybe' from t where name = ? and other = ?`
    );
  });

  test('sql.dangerous inlines trusted raw text', () => {
    const fragment = sql`select ${sql.dangerous('position')} from todos where id = ${'todo_1'}`;
    expect(compileSql(fragment)).toEqual({
      text: 'select position from todos where id = ?',
      params: ['todo_1']
    });
  });

  test('sql.dangerous rejects non-strings', () => {
    expect(() => sql.dangerous(42 as unknown as string)).toThrow(TypeError);
  });

  test('fragments are branded and stable', () => {
    const fragment = sql`select * from t where a = ${1} and b = ${2}`;
    expect(isSqlFragment(fragment)).toBe(true);
    expect(isSqlFragment({ text: 'select 1', params: [] })).toBe(false);
    expect(compileSql(fragment)).toEqual(compileSql(fragment));
  });
});
