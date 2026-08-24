/**
 * The one wheel.dev header, rendered by all four surfaces: the landing page,
 * the docs shell, the demos app, and the component catalog.
 *
 * There used to be three copies of this markup with three sets of class names,
 * which is why /docs, /demos, and /components each drifted to a different
 * font and a different nav. One component, one stylesheet (`site-chrome.css`),
 * one font vocabulary (`--sans` / `--mono`, both from `theme.css`).
 *
 * Every link is a plain anchor on purpose: these four surfaces are separate
 * builds served from separate paths, so a full page load is the correct
 * navigation, not a client-side route.
 */
import { For } from 'solid-js';
import { viewRoot } from 'wheel/core';

import { ThemeToggle } from '../components/ThemeToggle';
import { LINKS, NAV, type LinkKey } from './links';

/** Topnav: brand, section links, theme toggle. `active` bolds the current section. */
export function SiteHeader(props: { active?: LinkKey }) {
  return (
    <header use:viewRoot={{ name: 'SiteHeader', props }} class="site-topnav">
      {/* wheel-raw-anchor: separate builds per surface — a full page load is the correct navigation */}
      <a class="site-brand" href="/">
        🥝 wheel
      </a>
      <nav>
        <For each={NAV}>
          {(item) => (
            /* wheel-raw-anchor: separate builds per surface — a full page load is the correct navigation */
            <a
              href={LINKS[item.key]}
              classList={{ 'site-active': props.active === item.key }}
              aria-current={props.active === item.key ? 'page' : undefined}
            >
              {item.label}
            </a>
          )}
        </For>
        <ThemeToggle />
      </nav>
    </header>
  );
}

/** Footer: the same links, quieter. Landing and demos render it; docs does not. */
export function SiteFooter() {
  return (
    <footer use:viewRoot={'SiteFooter'} class="site-footer">
      <span>🥝 wheel</span>
      <nav>
        <For each={NAV}>
          {(item) => (
            /* wheel-raw-anchor: separate builds per surface — a full page load is the correct navigation */
            <a href={LINKS[item.key]}>{item.label}</a>
          )}
        </For>
      </nav>
    </footer>
  );
}
