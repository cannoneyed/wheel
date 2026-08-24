// wheel-view-root: this standalone review surface does not use application services.
import { createMemo, For, onCleanup, Show, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useSignal, viewRoot } from 'wheel/core';

import {
  COMPONENT_FIXTURES,
  COMPONENT_GROUPS,
  type ComponentFixture,
} from './component-fixtures';

type AuditTheme = 'light' | 'dark' | 'custom';

const themes: readonly AuditTheme[] = ['light', 'dark', 'custom'];

/**
 * The catalog previews default to whatever the SITE is showing, so a reader in
 * dark mode does not land on a light checkerboard. An explicit click on the
 * preview's own light/dark/custom control pins the preview and stops the
 * following — reviewing a light component inside a dark site is the whole
 * point of that control.
 */
function siteTheme(): 'light' | 'dark' {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') {
    return explicit;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function currentSlug(): string {
  // wheel-raw-location: this standalone catalog uses hash links and has no application router.
  const hash = window.location.hash.replace(/^#\/?/, '');
  return COMPONENT_FIXTURES.some((entry) => entry.slug === hash)
    ? hash
    : COMPONENT_FIXTURES[0]!.slug;
}

/** Provides a focused review path for each public component family. */
export function ComponentAudit(): JSX.Element {
  const [query, setQuery] = useSignal('', 'query');
  const [selectedSlug, setSelectedSlug] = useSignal(currentSlug(), 'selectedSlug');
  const [theme, setTheme] = useSignal<AuditTheme>(siteTheme(), 'theme');
  const [pinned, setPinned] = useSignal(false, 'pinned');
  const pickTheme = (value: AuditTheme) => {
    setPinned(true);
    setTheme(value);
  };
  const syncSlug = () => setSelectedSlug(currentSlug());
  window.addEventListener('hashchange', syncSlug);
  onCleanup(() => window.removeEventListener('hashchange', syncSlug));
  // The site toggle writes `data-theme` on <html>; with nothing stored the OS
  // preference applies. Watch both so the previews track either signal.
  const followSite = () => {
    if (!pinned()) {
      setTheme(siteTheme());
    }
  };
  const themeAttr = new MutationObserver(followSite);
  themeAttr.observe(document.documentElement, { attributeFilter: ['data-theme'] });
  const osTheme = window.matchMedia('(prefers-color-scheme: dark)');
  osTheme.addEventListener('change', followSite);
  onCleanup(() => {
    themeAttr.disconnect();
    osTheme.removeEventListener('change', followSite);
  });
  const filteredFixtures = createMemo(() => {
    const match = query().trim().toLowerCase();
    return match === ''
      ? COMPONENT_FIXTURES
      : COMPONENT_FIXTURES.filter((entry) => entry.name.toLowerCase().includes(match));
  });
  const selected = createMemo(
    () =>
      COMPONENT_FIXTURES.find((entry) => entry.slug === selectedSlug()) ??
      COMPONENT_FIXTURES[0]!,
  );
  const selectedNumber = createMemo(
    () => COMPONENT_FIXTURES.findIndex((entry) => entry.slug === selected().slug) + 1,
  );

  function relativeFixture(offset: number): ComponentFixture {
    const current = selectedNumber() - 1;
    const next = (current + offset + COMPONENT_FIXTURES.length) % COMPONENT_FIXTURES.length;
    return COMPONENT_FIXTURES[next]!;
  }

  return (
    <div use:viewRoot={'ComponentAudit'} class="component-audit" data-testid="component-audit">
      <aside class="component-audit__index" aria-label="Component family index">
        <div class="component-audit__brand">
          <span class="component-audit__mark" aria-hidden="true">W</span>
          <div>
            <strong>Wheel components</strong>
            <span>38-family library</span>
          </div>
        </div>

        <label class="component-audit__search">
          <span>Find a family</span>
          <input
            type="search"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search 38 families"
            data-testid="audit-search"
          />
        </label>

        <nav>
          <For each={COMPONENT_GROUPS}>
            {(group) => {
              const entries = () => filteredFixtures().filter((entry) => entry.group === group);
              return (
                <Show when={entries().length > 0}>
                  <section>
                    <h2>{group}</h2>
                    <For each={entries()}>
                      {(entry) => (
                        <a
                          href={`#/${entry.slug}`}
                          classList={{ active: selected().slug === entry.slug }}
                          aria-current={selected().slug === entry.slug ? 'page' : undefined}
                          data-family={entry.name}
                        >
                          <span>{entry.name}</span>
                          <span aria-hidden="true">›</span>
                        </a>
                      )}
                    </For>
                  </section>
                </Show>
              );
            }}
          </For>
        </nav>

        <p class="component-audit__count" data-testid="audit-filter-count">
          {filteredFixtures().length} of {COMPONENT_FIXTURES.length} families
        </p>
      </aside>

      <main class="component-audit__main">
        <header class="component-audit__header">
          <div>
            <p>Family {selectedNumber()} of {COMPONENT_FIXTURES.length}</p>
            <h1>{selected().name}</h1>
            <p class="component-audit__summary">{selected().summary}</p>
          </div>
          <div class="component-audit__stepper" aria-label="Select adjacent family">
            <a href={`#/${relativeFixture(-1).slug}`} aria-label="Previous family">←</a>
            <a href={`#/${relativeFixture(1).slug}`} aria-label="Next family">→</a>
          </div>
        </header>

        <div class="component-audit__quickstart">
          <span>Load the default theme once</span>
          <code>import 'wheel/components/styles';</code>
          {/* wheel-raw-anchor: the guide is in the separate documentation entry point. */}
          <a href="/docs/#/component-library">Setup and theming →</a>
        </div>

        <section class="component-audit__panel" aria-labelledby="preview-title">
          <div class="component-audit__panel-header">
            <div>
              <span>Interactive preview</span>
              <h2 id="preview-title">{selected().name}</h2>
            </div>
            <div class="component-audit__themes" aria-label="Preview theme">
              <For each={themes}>
                {(value) => (
                  <button
                    type="button"
                    classList={{ active: theme() === value }}
                    aria-pressed={theme() === value}
                    onClick={() => pickTheme(value)}
                    data-testid={`audit-theme-${value}`}
                  >
                    {value}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div
            class="component-audit__preview"
            classList={{ 'component-audit__preview--custom': theme() === 'custom' }}
            data-theme={theme() === 'dark' ? 'dark' : 'light'}
            data-testid="audit-preview"
          >
            <Dynamic component={selected().component} />
          </div>
        </section>

        <AuditEvidence fixture={selected()} />
      </main>
    </div>
  );
}

function AuditEvidence(props: { readonly fixture: ComponentFixture }): JSX.Element {
  const demoSlug = () => props.fixture.demoSlug ?? props.fixture.slug;
  return (
    <section class="component-audit__evidence" aria-labelledby="evidence-title">
      <div class="component-audit__evidence-header">
        <div>
          <span>Package reference</span>
          <h2 id="evidence-title">Use this family</h2>
        </div>
        <span class="component-audit__coverage">
          {props.fixture.browserCheck ?? 'Bulk light and dark render'}
        </span>
      </div>
      <dl>
        <div>
          <dt>Deep import</dt>
          <dd><code>{`import { ${props.fixture.name} } from 'wheel/components/${props.fixture.slug}';`}</code></dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd><code>{`packages/wheel/src/components/${props.fixture.slug}/index.ts`}</code></dd>
        </div>
        <div>
          <dt>Demo</dt>
          <dd><code>{`packages/playground/src/component-demos/${demoSlug()}.tsx`}</code></dd>
        </div>
        <div>
          <dt>Guide</dt>
          {/* wheel-raw-anchor: the guide is in the separate documentation entry point. */}
          <dd><a href="/docs/#/component-library">Setup, themes, and CSS overrides</a></dd>
        </div>
      </dl>
    </section>
  );
}
