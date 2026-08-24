// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { areArraysEqual } from './areArraysEqual';

describe('areArraysEqual', () => {
  it('returns true for arrays with the same items in the same order', () => {
    expect(areArraysEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('returns false for arrays of different lengths', () => {
    expect(areArraysEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('returns false when items differ', () => {
    expect(areArraysEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('uses a custom item comparer when provided', () => {
    const a = [{ id: 1 }, { id: 2 }];
    const b = [{ id: 1 }, { id: 2 }];
    expect(areArraysEqual(a, b)).toBe(false);
    expect(areArraysEqual(a, b, (x, y) => x.id === y.id)).toBe(true);
  });
});
