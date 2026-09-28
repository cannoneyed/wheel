/**
 * Key combos as data: parse, match, and format.
 *
 * A combo is a string like `'mod+shift+z'`: modifiers plus one key. These
 * functions are pure (no service, no DOM listener), so a help screen, a
 * menu, a test, and `KeyboardService.dispatch` all read combos the same way.
 * The key is compared to `event.key` (the character), so `mod+z` follows the
 * Z label.
 */

/** The platforms that name and draw modifiers differently. */
export type KeyPlatform = 'mac' | 'win' | 'linux';

/** A parsed key combo: exact modifier set plus the key to compare. */
export interface ParsedCombo {
  /** Lowercased non-modifier key (`'k'`, `'escape'`, `'arrowdown'`). */
  readonly key: string;
  /** Ctrl must be held. */
  readonly ctrl: boolean;
  /** Meta (cmd) must be held. */
  readonly meta: boolean;
  /** Alt (option) must be held. */
  readonly alt: boolean;
  /** Shift must be held. */
  readonly shift: boolean;
}

/** The platform this runtime reports. Headless runtimes count as linux. */
export function detectPlatform(): KeyPlatform {
  const platform = typeof navigator === 'undefined' ? '' : (navigator.platform ?? '');
  if (/mac|iphone|ipad|ipod/i.test(platform)) return 'mac';
  if (/win/i.test(platform)) return 'win';
  return 'linux';
}

/** Whether this runtime is an Apple platform (decides what `mod` means). */
function isMacPlatform(): boolean {
  return detectPlatform() === 'mac';
}

/** Word forms for keys the `+` separator or trimming would swallow. */
const KEY_WORDS: Readonly<Record<string, string>> = {
  // A literal ' ' would be trimmed away by the parser.
  space: ' ',
  // A literal '+' is the separator.
  plus: '+'
};

/**
 * Parse a `'mod+k'`-style combo into an exact modifier set. `mod` resolves
 * to cmd on macOS and ctrl elsewhere (override `mac` for headless tests).
 * Throws on combos with no non-modifier key — a modifier-only "shortcut" is
 * always a registration bug. Write `space` and `plus` for those two keys.
 */
export function parseCombo(
  combo: string,
  mac: boolean = isMacPlatform()
): ParsedCombo {
  let ctrl = false;
  let meta = false;
  let alt = false;
  let shift = false;
  let key = '';
  for (const raw of combo.split('+')) {
    const part = raw.trim().toLowerCase();
    switch (part) {
      case 'mod':
        if (mac) meta = true;
        else ctrl = true;
        break;
      case 'ctrl':
      case 'control':
        ctrl = true;
        break;
      case 'cmd':
      case 'meta':
        meta = true;
        break;
      case 'alt':
      case 'option':
        alt = true;
        break;
      case 'shift':
        shift = true;
        break;
      default:
        key = KEY_WORDS[part] ?? part;
    }
  }
  if (!key) {
    throw new Error(`Key combo '${combo}' has no non-modifier key`);
  }
  return { key, ctrl, meta, alt, shift };
}

/**
 * Whether a keydown event matches a parsed combo — key compared
 * case-insensitively, modifiers exactly (`ctrl+k` does NOT match
 * `ctrl+shift+k`).
 */
export function matchesCombo(event: KeyboardEvent, combo: ParsedCombo): boolean {
  return (
    event.key?.toLowerCase() === combo.key &&
    event.ctrlKey === combo.ctrl &&
    event.metaKey === combo.meta &&
    event.altKey === combo.alt &&
    event.shiftKey === combo.shift
  );
}

/**
 * Whether a keydown belongs to an input method (IME) composition. While a
 * Japanese or Chinese user picks a candidate, Enter and the arrows belong to
 * the IME, not to the app. Browsers mark those events with `isComposing`,
 * and some (Safari) send `keyCode` 229 for the key that ends composition.
 */
export function isComposingEvent(event: KeyboardEvent): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

/** Mac symbols for named keys, as Apple menus draw them. */
const MAC_KEYS: Readonly<Record<string, string>> = {
  enter: '↩',
  return: '↩',
  escape: '⎋',
  esc: '⎋',
  backspace: '⌫',
  delete: '⌦',
  tab: '⇥',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  pageup: '⇞',
  pagedown: '⇟',
  home: '↖',
  end: '↘',
  ' ': 'Space'
};

/** Words for named keys on Windows and Linux. */
const PC_KEYS: Readonly<Record<string, string>> = {
  enter: 'Enter',
  return: 'Enter',
  escape: 'Esc',
  esc: 'Esc',
  backspace: 'Backspace',
  delete: 'Del',
  tab: 'Tab',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  home: 'Home',
  end: 'End',
  insert: 'Ins',
  ' ': 'Space'
};

/** A key's display text: symbols or words for named keys, capitals for the rest. */
function keyLabel(key: string, platform: KeyPlatform): string {
  const named = (platform === 'mac' ? MAC_KEYS : PC_KEYS)[key];
  if (named) return named;
  if (/^f\d{1,2}$/.test(key)) return key.toUpperCase();
  if (key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * The text a menu, palette row, or help screen shows for a combo. Every
 * surface calls this one function, so a shortcut reads the same everywhere.
 *
 *   formatCombo('mod+shift+z', 'mac');  // '⇧⌘Z'
 *   formatCombo('mod+shift+z', 'win');  // 'Ctrl+Shift+Z'
 *   formatCombo('alt+arrowup', 'linux'); // 'Alt+Up'
 *
 * Mac uses Apple's modifier order (⌃ ⌥ ⇧ ⌘) and symbols, with no
 * separator. Windows and Linux use words joined with `+`. Steps separated
 * by a space (`'g i'`) format one by one and keep the space.
 */
export function formatCombo(combo: string, platform: KeyPlatform = detectPlatform()): string {
  return combo
    .trim()
    .split(/\s+/)
    .map((step) => formatStep(step, platform))
    .join(' ');
}

function formatStep(step: string, platform: KeyPlatform): string {
  const parsed = parseCombo(step, platform === 'mac');
  const key = keyLabel(parsed.key, platform);
  if (platform === 'mac') {
    return `${parsed.ctrl ? '⌃' : ''}${parsed.alt ? '⌥' : ''}${parsed.shift ? '⇧' : ''}${parsed.meta ? '⌘' : ''}${key}`;
  }
  const parts: string[] = [];
  if (parsed.meta) parts.push(platform === 'win' ? 'Win' : 'Super');
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}
