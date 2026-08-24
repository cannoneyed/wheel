/**
 * The light/dark toggle shared by the wheel.dev landing page, its /docs entry,
 * and the standalone docs site. An explicit choice writes `data-theme` on
 * <html> and persists; with nothing stored, the OS preference applies (the
 * pre-paint script in each index.html restores the stored choice before first
 * paint, so there is no flash).
 */
import { useSignal, viewRoot } from 'wheel/core';

const THEME_KEY = 'wheel-theme';

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') {
    return explicit;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Sun/moon button: flips the theme, persists the choice across the site. */
export function ThemeToggle() {
  const [theme, setTheme] = useSignal<Theme>(currentTheme(), 'theme');
  const flip = () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    setTheme(next);
  };
  return (
    <button
      use:viewRoot={'ThemeToggle'}
      type="button"
      class="theme-toggle"
      onClick={flip}
      title={theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle color theme"
    >
      {theme() === 'dark' ? '☀' : '☾'}
    </button>
  );
}
