/**
 * Above-the-fold shell plus the CTA row that repeats at the close. Both carry
 * zero copy — the words live in `src/home.mdx`. The install block that used to
 * live here is now `agent-install.tsx`.
 */
import { For, type JSX } from 'solid-js';
import { viewRoot } from 'wheel/core';

import { LINKS, type LinkKey } from '../links';

/** The hero band: a headline, a sub-paragraph, and whatever else MDX puts here. */
export function Hero(props: { children: JSX.Element }) {
  return (
    <section use:viewRoot={{ name: 'Hero', props }} class="hero" data-testid="hero">
      {props.children}
    </section>
  );
}

/**
 * A row of buttons. Targets are named (`to="docs"`), never spelled as URLs,
 * so `links.ts` stays the only place a destination is written down.
 */
export function Ctas(props: { links: Array<{ label: string; to: LinkKey; primary?: boolean }> }) {
  return (
    <div use:viewRoot={{ name: 'Ctas', props }} class="ctas" data-testid="ctas">
      <For each={props.links}>
        {(cta) => (
          <a classList={{ btn: true, primary: cta.primary === true }} href={LINKS[cta.to]}>
            {cta.label}
          </a>
        )}
      </For>
    </div>
  );
}
