import { describe, expect, test } from 'vitest';
import { CanonicalParamsError, canonicalParams } from './params';

describe('canonicalParams', () => {
  test('key order does not matter', () => {
    expect(canonicalParams({ b: 1, a: 'x' })).toBe(canonicalParams({ a: 'x', b: 1 }));
  });

  test('nested objects canonicalize recursively', () => {
    expect(canonicalParams({ viewport: { r1: 10, r0: 0 }, sheetId: 's' })).toBe(
      canonicalParams({ sheetId: 's', viewport: { r0: 0, r1: 10 } })
    );
  });

  test('undefined object values are stripped (absent === undefined)', () => {
    expect(canonicalParams({ a: 1, b: undefined })).toBe(canonicalParams({ a: 1 }));
  });

  test('array order matters', () => {
    expect(canonicalParams({ ids: [1, 2] })).not.toBe(canonicalParams({ ids: [2, 1] }));
  });

  test.each([
    ['NaN', { n: NaN }],
    ['Infinity', { n: Infinity }],
    ['bigint', { n: 1n }],
    ['function', { f: () => 1 }],
    ['Date instance', { d: new Date(0) }],
    ['Map instance', { m: new Map() }],
    ['undefined in array', { a: [1, undefined] }],
    ['top-level undefined', undefined]
  ])('rejects %s loudly', (_label, params) => {
    expect(() => canonicalParams(params)).toThrow(CanonicalParamsError);
  });

  test('rejects circular references instead of hanging', () => {
    const params: Record<string, unknown> = {};
    params.self = params;
    expect(() => canonicalParams(params)).toThrow(/circular/);
  });

  test('error names the offending path', () => {
    expect(() => canonicalParams({ filter: { when: new Date(0) } })).toThrow(/\.filter\.when/);
  });

  test('sibling branches after a cycle-free subtree still canonicalize', () => {
    const shared = { x: 1 };
    expect(canonicalParams({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
  });
});
