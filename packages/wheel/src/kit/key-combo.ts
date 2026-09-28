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

/** A canonical, order-free spelling of a parsed combo for comparison. */
function comboSignature(parsed: ParsedCombo): string {
  return [parsed.ctrl && 'ctrl', parsed.meta && 'meta', parsed.alt && 'alt', parsed.shift && 'shift', parsed.key]
    .filter(Boolean)
    .join('+');
}

/** Two or more bindings on one combo. */
export interface ComboConflict {
  /** The combo as the first binding wrote it. */
  readonly combo: string;
  /** The binding ids, in registration order. */
  readonly ids: readonly string[];
  /** Each binding's scope, `null` for global, in the same order. */
  readonly scopes: readonly (string | null)[];
  /**
   * - `same-scope`: same scope, and at least one binding has no gate, so a
   *   later binding can never fire while an earlier ungated one matches.
   *   Always a bug.
   * - `gated`: same scope, every binding gated (`when`, or a command's
   *   `visible`). Fine when the gates never hold at once (list `↓` and
   *   board `↓`); listed so a reviewer can check that.
   * - `shadowed`: different scopes. The innermost scope wins by design
   *   (editor `Enter` over grid `Enter`); listed, not an error.
   */
  readonly kind: 'same-scope' | 'gated' | 'shadowed';
}

/** What `findConflicts` reads from each binding. */
export interface ConflictCheckInput {
  readonly id: string;
  readonly key: string;
  readonly scope?: string;
  /** Whether the binding only fires while some gate holds. */
  readonly gated: boolean;
}

/**
 * Group bindings that answer the same keys. Two combos conflict when they
 * parse to the same modifiers and key, however they were written
 * (`shift+mod+z` and `mod+shift+z`). Pure, so an app test can fail on a
 * `same-scope` conflict:
 *
 *   expect(keyboard.conflicts().filter((c) => c.kind === 'same-scope')).toEqual([]);
 */
export function findConflicts(
  bindings: readonly ConflictCheckInput[],
  platform: KeyPlatform = detectPlatform()
): readonly ComboConflict[] {
  const mac = platform === 'mac';
  const groups = new Map<string, ConflictCheckInput[]>();
  for (const binding of bindings) {
    const signature = comboSignature(parseCombo(binding.key, mac));
    const group = groups.get(signature);
    if (group) group.push(binding);
    else groups.set(signature, [binding]);
  }
  const conflicts: ComboConflict[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const byScope = new Map<string | null, ConflictCheckInput[]>();
    for (const binding of group) {
      const scope = binding.scope ?? null;
      const bucket = byScope.get(scope);
      if (bucket) bucket.push(binding);
      else byScope.set(scope, [binding]);
    }
    for (const [scope, bucket] of byScope) {
      if (bucket.length < 2) continue;
      conflicts.push({
        combo: bucket[0].key,
        ids: bucket.map((binding) => binding.id),
        scopes: bucket.map(() => scope),
        kind: bucket.every((binding) => binding.gated) ? 'gated' : 'same-scope'
      });
    }
    if (byScope.size > 1) {
      conflicts.push({
        combo: group[0].key,
        ids: group.map((binding) => binding.id),
        scopes: group.map((binding) => binding.scope ?? null),
        kind: 'shadowed'
      });
    }
  }
  return conflicts;
}
