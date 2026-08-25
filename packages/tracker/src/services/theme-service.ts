/**
 * Light by default; dark when the OS asks for it or the reader picked it.
 *
 * Wheel's tokens own the rule (packages/wheel/src/styles/tokens.css): an
 * explicit choice is `data-theme` on <html>, and with no attribute set the OS
 * preference decides. The pre-paint script in index.html restores the stored
 * choice before first paint, so this service never stamps anything at boot —
 * it only reads what is already true and flips it on demand.
 */
import { Service } from 'wheel/core';

type Theme = 'dark' | 'light';

const THEME_KEY = 'wheel-theme';

/** The theme in effect right now: the explicit choice, else the OS. */
function currentTheme(): Theme {
  if (typeof document === 'undefined') {
    return 'light';
  }
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') {
    return explicit;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/** Owns the theme attribute on <html>. */
export class ThemeService extends Service {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'ThemeService';

  /** The active theme. Connect directly (`view({ theme: svc.theme })`). */
  readonly theme = this.atom<Theme>(currentTheme(), 'theme');

  /** Flip dark/light; persists the choice and stamps <html data-theme>. */
  readonly toggle = this.action(() => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = next;
      localStorage.setItem(THEME_KEY, next);
    }
  }, 'toggle');

  /**
   * Re-read the theme already in effect (called once from the shell). The
   * pre-paint script has run by now, so this just syncs the atom to it —
   * stamping `data-theme` here would pin the theme and defeat the OS default.
   */
  readonly apply = this.action(() => {
    this.theme.set(currentTheme());
  }, 'apply');
}
