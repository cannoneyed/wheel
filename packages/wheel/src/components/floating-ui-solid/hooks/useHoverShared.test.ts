// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getDelay, isClickLikeOpenEvent, isHoverOpenEvent } from './useHoverShared';

describe('useHoverShared', () => {
  describe('getDelay', () => {
    it('returns a plain number delay as-is', () => {
      expect(getDelay(1000, 'open')).toBe(1000);
      expect(getDelay(1000, 'close')).toBe(1000);
    });

    it('reads the open/close key off an object delay', () => {
      expect(getDelay({ open: 500 }, 'open')).toBe(500);
      expect(getDelay({ open: 500 }, 'close')).toBeUndefined();
      expect(getDelay({ close: 250 }, 'close')).toBe(250);
    });

    it('forces a zero delay for non-mouse-like pointer types', () => {
      expect(getDelay(1000, 'open', 'touch')).toBe(0);
      expect(getDelay({ open: 500 }, 'open', 'touch')).toBe(0);
    });

    it('keeps the configured delay for mouse-like pointer types', () => {
      expect(getDelay(1000, 'open', 'mouse')).toBe(1000);
      expect(getDelay(1000, 'open', 'pen')).toBe(1000);
    });
  });

  describe('isClickLikeOpenEvent', () => {
    it('is true when the open event type is click or mousedown', () => {
      expect(isClickLikeOpenEvent('click', false)).toBe(true);
      expect(isClickLikeOpenEvent('mousedown', false)).toBe(true);
    });

    it('is true when the trigger was interacted with inside', () => {
      expect(isClickLikeOpenEvent('mouseenter', true)).toBe(true);
    });

    it('is false for a hover-only open with no inside interaction', () => {
      expect(isClickLikeOpenEvent('mouseenter', false)).toBe(false);
      expect(isClickLikeOpenEvent(undefined, false)).toBe(false);
    });
  });

  describe('isHoverOpenEvent', () => {
    it('is true for mouse events other than mousedown', () => {
      expect(isHoverOpenEvent('mouseenter')).toBe(true);
      expect(isHoverOpenEvent('mousemove')).toBe(true);
    });

    it('is false for mousedown and non-mouse events', () => {
      expect(isHoverOpenEvent('mousedown')).toBe(false);
      expect(isHoverOpenEvent('click')).toBe(false);
      expect(isHoverOpenEvent(undefined)).toBeFalsy();
    });
  });
});
