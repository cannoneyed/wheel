/**
 * The grouped page list both docs shells put in their sidebar. Groups and
 * ordering come from packages/docs/src/nav.ts (resolved into pages by
 * pages.ts) — this component only draws them, so the standalone site and
 * wheel.dev's /docs entry cannot show different navigation.
 */
import { For } from 'solid-js';
import { viewRoot } from 'wheel/core';

import { NAV } from '../pages';

export function SidebarNav(props: { slug: string }) {
  return (
    <div use:viewRoot={{ name: 'SidebarNav', props }} class="sidebar-nav">
      <For each={NAV}>
        {(group) => (
          <div class="sidebar-group">
            {/* The uppercase mono micro-label heading a group's rows — the same
                label treatment as table heads, asides, and the landing page's
                figure labels. */}
            <span class="sidebar-label">{group.id}</span>
            <For each={group.pages}>
              {(page) => (
                <a href={`#/${page.slug}`} classList={{ active: props.slug === page.slug }}>
                  {page.title}
                </a>
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}
