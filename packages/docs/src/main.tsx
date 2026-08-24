/**
 * Docs shell: the shared wheel.dev bar, a grouped sidebar, and hash routing
 * with no router dependency. Each page is an MDX module compiled to a Solid
 * component, and the right-hand rail is that page's own headings.
 *
 * This standalone build and the website's /docs entry render the same header,
 * the same sidebar, and the same pages — the two shells differ only in how
 * they are hosted.
 */
import { Dynamic, render } from 'solid-js/web';
import { createEffect, on } from 'solid-js';
import { useSignal, viewRoot } from 'wheel/core';

import './styles.css';
import './site/site-chrome.css';
import { MDX_COMPONENTS } from './mdx-components';
import { PAGES } from './pages';
import { PageToc } from './components/PageToc';
import { SidebarNav } from './components/SidebarNav';
import { SiteHeader } from './site/SiteHeader';

function currentSlug(): string {
  // wheel-raw-location: the docs site is a static, dependency-free hash shell
  // deployed to a host with no SPA fallback — it deliberately does not depend
  // on wheel/router, which is one of the things it documents.
  const hash = window.location.hash.replace(/^#\/?/, '');
  return PAGES.some((page) => page.slug === hash) ? hash : 'overview';
}

function App() {
  const [slug, setSlug] = useSignal(currentSlug(), 'slug');
  window.addEventListener('hashchange', () => setSlug(currentSlug()));
  const page = () => PAGES.find((p) => p.slug === slug())!;
  let content: HTMLElement | undefined;

  // imperative boundary: the document is the scroll container, so a new page
  // has to be told to start at the top — otherwise you land partway down the
  // next page at whatever offset you left the previous one.
  createEffect(on(slug, () => window.scrollTo({ top: 0 })));

  // wheel-view-root: fragment with multiple top-level elements
  return (
    <>
      <SiteHeader active="docs" />
      <div use:viewRoot={'App'} class="shell">
        <nav class="sidebar">
          {/* No wordmark here: the shared bar above already carries it. */}
          <SidebarNav slug={slug()} />
        </nav>
        <main class="content" ref={content}>
          <Dynamic component={page().component} components={MDX_COMPONENTS} />
        </main>
        <PageToc slug={slug()} container={() => content} />
      </div>
    </>
  );
}

render(() => <App />, document.getElementById('root')!);
