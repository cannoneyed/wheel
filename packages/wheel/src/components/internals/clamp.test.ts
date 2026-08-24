// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clamp } from './clamp';

describe('clamp', () => {
  it('clamps a value based on min and max', () => {
    expect(clamp(1, 2, 4)).toBe(2);
    expect(clamp(5, 2, 4)).toBe(4);
    expect(clamp(-5, -1, 5)).toBe(-1);
  });

  it('returns the value unchanged when within bounds', () => {
    expect(clamp(3, 2, 4)).toBe(3);
  });

  it('defaults to MIN/MAX_SAFE_INTEGER bounds', () => {
    expect(clamp(3)).toBe(3);
  });
});
