/**
 * The website's /docs entry: the real documentation pages from packages/docs,
 * rendered inside wheel.dev chrome. Single source of truth — this file imports
 * the docs registry and components straight from the docs package source, so
 * a docs edit shows up here with no copy step.
 *
 * Same shell mechanics as the docs site: hash routing, no router dependency.
 */
import { Dynamic, render } from 'solid-js/web';
import { createEffect, on } from 'solid-js';
import { ServiceProvider, useSignal } from 'wheel/core';
import { WheelAnnotate } from 'wheel/annotate';

import '../../docs/src/styles.css';
import '../../docs/src/site/site-chrome.css';
import { MDX_COMPONENTS } from '../../docs/src/mdx-components';
import { PAGES } from '../../docs/src/pages';
import { AlphaBanner } from '../../docs/src/components/AlphaBanner';
import { PageToc } from '../../docs/src/components/PageToc';
import { SidebarNav } from '../../docs/src/components/SidebarNav';
import { SiteHeader } from '../../docs/src/site/SiteHeader';

function currentSlug(): string {
  // wheel-raw-location: static docs shell on a host with no SPA fallback — it
  // deliberately does not depend on wheel/router, which is one of the things
  // it documents (same stance as packages/docs/src/main.tsx).
  const hash = window.location.hash.replace(/^#\/?/, '');
  return PAGES.some((page) => page.slug === hash) ? hash : 'overview';
}

function DocsApp() {
  // wheel-view-root: fragment with multiple top-level elements
  const [slug, setSlug] = useSignal(currentSlug(), 'slug');
  window.addEventListener('hashchange', () => setSlug(currentSlug()));
  const page = () => PAGES.find((p) => p.slug === slug())!;
  let content: HTMLElement | undefined;

  // imperative boundary: the document is the scroll container, so a new page
  // has to be told to start at the top — otherwise you land partway down the
  // next page at whatever offset you left the previous one.
  createEffect(on(slug, () => window.scrollTo({ top: 0 })));

  return (
    <>
      <SiteHeader active="docs" />
      <div class="shell">
        <nav class="sidebar">
          {/* No wordmark here: the topnav above already carries it. The grouped
              page list is the shared SidebarNav, so both shells read
              identically below the bar. */}
          <SidebarNav slug={slug()} />
        </nav>
        <main class="content" ref={content}>
          <AlphaBanner />
          <Dynamic component={page().component} components={MDX_COMPONENTS} />
        </main>
        <PageToc slug={slug()} container={() => content} />
      </div>
    </>
  );
}

/**
 * The documentation shell is plain Solid, not a wheel app — so the annotator needs a
 * provider to hang off. `ServiceProvider` is clientless and holds no services
 * here; it exists to give the annotator a registry and a clock. Notes on this
 * page anchor to ELEMENTS (a DOM path plus a quote of the text), which is what
 * prose has instead of components.
 */
render(
  () => (
    <ServiceProvider scopeId="docsapp">
      <DocsApp />
      <WheelAnnotate />
    </ServiceProvider>
  ),
  document.getElementById('root')!
);
