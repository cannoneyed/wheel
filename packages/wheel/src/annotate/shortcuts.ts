/**
 * The annotator's keys, named once so the label on a button and the handler
 * behind it can never drift apart.
 *
 * A shortcut nobody can see is a shortcut nobody uses, so every key here is
 * printed on the control it drives.
 */

/** True on a Mac, where the arming chord uses ⌘ rather than Ctrl. */
function isApple(): boolean {
  const ua = globalThis.navigator?.userAgent ?? '';
  return /Mac|iPhone|iPad|iPod/.test(ua);
}

/** How the arming chord is written for this platform. */
export function armChord(): string {
  return isApple() ? '⇧⌘A' : 'Ctrl+Shift+A';
}

/**
 * The single letters that drive the composer: talk, save, discard.
 *
 * Single letters and not chords because the composer is a small, temporary
 * mode — the same reason a mail client gets away with `r` for reply. They are
 * ignored while a text box has focus, so typing the note never fires one.
 */
export const COMPOSER_KEYS = {
  talk: 't',
  save: 's',
  discard: 'd'
} as const;

/**
 * Labels are picked by number, in the order they are shown.
 *
 * Letters would have been nicer to read, but `t`, `s` and `d` are taken by
 * talk, save and discard — and "todo" has no free letter left. Numbers also
 * say the right thing about a label: it is one choice out of a short list.
 */
export function labelKey(index: number): string {
  return String(index + 1);
}

/**
 * Whether a key event came from somewhere text is being typed.
 *
 * The composer's own textarea is the obvious case; a `contenteditable` in the
 * app underneath is the one that would be missed.
 */
export function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
