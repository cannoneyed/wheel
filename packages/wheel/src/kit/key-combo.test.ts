// @vitest-environment jsdom
/**
 * Key combos as data: the `plus` key word, IME composition detection, and
 * display text per platform.
 */
import { describe, expect, it } from 'vitest';

import { formatCombo, isComposingEvent, parseCombo } from './key-combo';

function keydown(init: KeyboardEventInit & { keyCode?: number }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  if (init.keyCode !== undefined) Object.defineProperty(event, 'keyCode', { value: init.keyCode });
  return event;
}

describe('parseCombo', () => {
  it("parses 'plus' as the + key, which the separator would otherwise swallow", () => {
    expect(parseCombo('mod+shift+plus', false).key).toBe('+');
  });
});

describe('isComposingEvent', () => {
  it('flags isComposing and the 229 key code', () => {
    expect(isComposingEvent(keydown({ key: 'Enter', isComposing: true }))).toBe(true);
    expect(isComposingEvent(keydown({ key: 'Process', keyCode: 229 }))).toBe(true);
    expect(isComposingEvent(keydown({ key: 'Enter' }))).toBe(false);
  });
});

describe('formatCombo', () => {
  it('draws Mac symbols in Apple order with no separator', () => {
    expect(formatCombo('mod+shift+z', 'mac')).toBe('⇧⌘Z');
    expect(formatCombo('shift+mod+z', 'mac')).toBe('⇧⌘Z');
    expect(formatCombo('ctrl+alt+shift+mod+k', 'mac')).toBe('⌃⌥⇧⌘K');
    expect(formatCombo('mod+enter', 'mac')).toBe('⌘↩');
    expect(formatCombo('mod+backspace', 'mac')).toBe('⌘⌫');
    expect(formatCombo('alt+arrowup', 'mac')).toBe('⌥↑');
    expect(formatCombo('escape', 'mac')).toBe('⎋');
  });

  it('writes words joined with + on Windows and Linux', () => {
    expect(formatCombo('mod+shift+z', 'win')).toBe('Ctrl+Shift+Z');
    expect(formatCombo('alt+arrowup', 'linux')).toBe('Alt+Up');
    expect(formatCombo('mod+/', 'win')).toBe('Ctrl+/');
    expect(formatCombo('space', 'win')).toBe('Space');
    expect(formatCombo('meta+e', 'win')).toBe('Win+E');
    expect(formatCombo('f2', 'win')).toBe('F2');
  });

  it('formats each step of a sequence and keeps the space', () => {
    expect(formatCombo('ctrl+alt+n c', 'win')).toBe('Ctrl+Alt+N C');
    expect(formatCombo('g i', 'mac')).toBe('G I');
  });
});
