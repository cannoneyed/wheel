// wheel-view-root: this standalone review surface does not use application services.
import { createMemo, For, onCleanup, Show, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { Button, Code, IconButton, Input, Tabs } from 'wheel/components';
import { useSignal, viewRoot } from 'wheel/core';

import {
  ComponentReferencePage,
  ThemePicker,
  type ComponentReferenceTheme,
} from './component-reference';
import { COMPONENT_REFERENCES } from './component-references';
import { componentSpec, ComponentSpecPage } from './component-spec';
import {
  demoActionSurface,
  DemoFeedbackProvider,
  useDemoActionFeedback,
} from './demo-feedback';
import {
  COMPONENT_FIXTURES,
  COMPONENT_GROUPS,
  type ComponentFixture,
} from './component-fixtures';
import { highlightSyntax } from './syntax-highlight';

type AuditTheme = ComponentReferenceTheme;
type ComponentPageView = 'reference' | 'spec';

interface NavigationFamily {
  readonly name: string;
  readonly entries: readonly ComponentFixture[];
}

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

function familyName(fixture: ComponentFixture): string {
  return fixture.family ?? fixture.name;
}

function fixtureForSlug(slug: string): ComponentFixture {
  return COMPONENT_FIXTURES.find((entry) => entry.slug === slug) ?? COMPONENT_FIXTURES[0]!;
}

function resetContentScroll(): void {
  window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
}

function navigationFamilies(fixtures: readonly ComponentFixture[]): readonly NavigationFamily[] {
  const families = new Map<string, ComponentFixture[]>();
  for (const fixture of fixtures) {
    const name = familyName(fixture);
    const entries = families.get(name) ?? [];
    entries.push(fixture);
    families.set(name, entries);
  }
  return Array.from(families, ([name, entries]) => ({
    name,
    entries: entries.slice().sort(
      (left, right) => (left.familyOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.familyOrder ?? Number.MAX_SAFE_INTEGER),
    ),
  }));
}

const COMPONENT_NAVIGATION = COMPONENT_GROUPS.flatMap((group) =>
  navigationFamilies(COMPONENT_FIXTURES.filter((entry) => entry.group === group))
    .flatMap((family) => family.entries)
);

/** Provides a focused review path for each public component family. */
export function ComponentAudit(): JSX.Element {
  const [query, setQuery] = useSignal('', 'query');
  const [selectedSlug, setSelectedSlug] = useSignal(currentSlug(), 'selectedSlug');
  const [openFamilies, setOpenFamilies] = useSignal<readonly string[]>(
    [familyName(fixtureForSlug(currentSlug()))],
    'openFamilies',
  );
  const [theme, setTheme] = useSignal<AuditTheme>(siteTheme(), 'theme');
  const [pinned, setPinned] = useSignal(false, 'pinned');
  const [pageView, setPageView] = useSignal<ComponentPageView>('reference', 'pageView');
  const pickTheme = (value: AuditTheme) => {
    setPinned(true);
    setTheme(value);
  };
  const openFamily = (name: string) => {
    setOpenFamilies((current) => current.includes(name) ? current : [...current, name]);
  };
  const closeFamily = (name: string) => {
    setOpenFamilies((current) => current.filter((entry) => entry !== name));
  };
  const syncSlug = () => {
    const slug = currentSlug();
    setSelectedSlug(slug);
    openFamily(familyName(fixtureForSlug(slug)));
    resetContentScroll();
  };
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
      : COMPONENT_FIXTURES.filter((entry) =>
        entry.name.toLowerCase().includes(match) || familyName(entry).toLowerCase().includes(match)
      );
  });
  const selected = createMemo(
    () =>
      COMPONENT_FIXTURES.find((entry) => entry.slug === selectedSlug()) ??
      COMPONENT_FIXTURES[0]!,
  );
  const selectedNumber = createMemo(
    () => COMPONENT_NAVIGATION.findIndex((entry) => entry.slug === selected().slug) + 1,
  );
  const selectedFamilyEntries = createMemo(() =>
    COMPONENT_FIXTURES
      .filter((entry) => familyName(entry) === familyName(selected()))
      .slice()
      .sort(
        (left, right) => (left.familyOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.familyOrder ?? Number.MAX_SAFE_INTEGER),
      )
  );
  const selectedFamilyNumber = createMemo(
    () => selectedFamilyEntries().findIndex((entry) => entry.slug === selected().slug) + 1,
  );
  const reference = createMemo(() => COMPONENT_REFERENCES[selected().slug]);
  const spec = createMemo(() => componentSpec(selected().slug));

  function relativeFixture(offset: number): ComponentFixture {
    const current = selectedNumber() - 1;
    const next = (current + offset + COMPONENT_NAVIGATION.length) % COMPONENT_NAVIGATION.length;
    return COMPONENT_NAVIGATION[next]!;
  }

  return (
    <DemoFeedbackProvider>
      <div use:viewRoot={'ComponentAudit'} class="component-audit" data-testid="component-audit">
      <aside class="component-audit__index" aria-label="Component family index">
        <div class="component-audit__brand">
          <span class="component-audit__mark" aria-hidden="true">W</span>
          <div>
            <strong>Wheel components</strong>
            <span>{COMPONENT_FIXTURES.length} component pages</span>
          </div>
        </div>

        <label class="component-audit__search">
          <span>Find a component</span>
          <Input
            type="search"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            placeholder={`Search ${COMPONENT_FIXTURES.length} components`}
            data-testid="audit-search"
          />
        </label>

        <nav>
          <For each={COMPONENT_GROUPS}>
            {(group) => {
              const entries = () => filteredFixtures().filter((entry) => entry.group === group);
              const families = () => navigationFamilies(entries());
              return (
                <Show when={entries().length > 0}>
                  <section>
                    <h2>{group}</h2>
                    <For each={families()}>
                      {(family) => {
                        const expanded = () =>
                          query().trim() !== '' || openFamilies().includes(family.name);
                        return (
                          <Show
                            when={family.entries.length > 1}
                            fallback={<FixtureLink fixture={family.entries[0]!} selectedSlug={selected().slug} />}
                          >
                            <div class="component-audit__family-group">
                              <Button
                                class="component-audit__family-toggle"
                                classList={{ active: familyName(selected()) === family.name }}
                                variant="ghost"
                                size="sm"
                                aria-expanded={expanded()}
                                data-component-family={family.name}
                                endContent={<FamilyChevron expanded={expanded()} />}
                                onClick={() => {
                                  if (expanded()) {
                                    closeFamily(family.name);
                                    return;
                                  }
                                  openFamily(family.name);
                                  // wheel-raw-location: this standalone catalog uses hash links without an app router.
                                  window.location.hash = `/${family.entries[0]!.slug}`;
                                }}
                              >
                                {family.name}
                              </Button>
                              <div class="component-audit__family-children" hidden={!expanded()}>
                                <For each={family.entries}>
                                  {(entry) => <FixtureLink fixture={entry} selectedSlug={selected().slug} />}
                                </For>
                              </div>
                            </div>
                          </Show>
                        );
                      }}
                    </For>
                  </section>
                </Show>
              );
            }}
          </For>
        </nav>

        <p class="component-audit__count" data-testid="audit-filter-count">
          {filteredFixtures().length} of {COMPONENT_FIXTURES.length} components
        </p>
      </aside>

      <main class="component-audit__main">
        <header class="component-audit__header">
          <div>
            <p>
              {familyName(selected())} family · {selectedFamilyNumber()} of {selectedFamilyEntries().length}
            </p>
            <h1>{selected().name}</h1>
            <p class="component-audit__summary">{selected().summary}</p>
          </div>
          <div class="component-audit__stepper" aria-label="Select adjacent component">
            <IconButton
              href={`#/${relativeFixture(-1).slug}`}
              label="Previous component"
              icon={<span aria-hidden="true">←</span>}
              size="sm"
              variant="ghost"
            />
            <IconButton
              href={`#/${relativeFixture(1).slug}`}
              label="Next component"
              icon={<span aria-hidden="true">→</span>}
              size="sm"
              variant="ghost"
            />
          </div>
        </header>

        <Tabs.Root
          class="component-audit__page-tabs"
          value={pageView()}
          onValueChange={(value) => {
            if (value === 'reference' || value === 'spec') {
              setPageView(value);
            }
          }}
        >
          <Tabs.List
            class="component-audit__tabs"
            aria-label={`${selected().name} page`}
            activateOnFocus
          >
            <Tabs.Tab value="reference" data-testid="component-reference-tab">
              Reference
            </Tabs.Tab>
            <Tabs.Tab value="spec" data-testid="component-spec-tab">
              Spec
              <span
                class="component-audit__spec-status"
                classList={{ ready: spec() !== undefined }}
                aria-hidden="true"
              />
            </Tabs.Tab>
            <Tabs.Indicator />
          </Tabs.List>
          <Tabs.Panel class="component-audit__tab-panel" value="reference" keepMounted>
            <Show
              when={reference() !== undefined}
              fallback={
                <LegacyComponentPage
                  fixture={selected()}
                  theme={theme()}
                  onThemeChange={pickTheme}
                />
              }
            >
              <ComponentReferencePage
                componentName={selected().name}
                component={selected().component}
                reference={reference()!}
                theme={theme()}
                themes={themes}
                onThemeChange={pickTheme}
              />
            </Show>
          </Tabs.Panel>
          <Tabs.Panel class="component-audit__tab-panel" value="spec" keepMounted>
            <ComponentSpecPage
              componentName={selected().name}
              slug={selected().slug}
              spec={spec()}
            />
          </Tabs.Panel>
        </Tabs.Root>
      </main>
      </div>
    </DemoFeedbackProvider>
  );
}

function FixtureLink(props: {
  readonly fixture: ComponentFixture;
  readonly selectedSlug: string;
}): JSX.Element {
  return (
    <Button
      href={`#/${props.fixture.slug}`}
      onClick={resetContentScroll}
      classList={{ active: props.selectedSlug === props.fixture.slug }}
      size="sm"
      variant="ghost"
      aria-current={props.selectedSlug === props.fixture.slug ? 'page' : undefined}
      data-family={props.fixture.name}
    >
      {props.fixture.name}
    </Button>
  );
}

function FamilyChevron(props: { readonly expanded: boolean }): JSX.Element {
  return (
    <svg
      class="component-audit__family-chevron"
      data-family-chevron={props.expanded ? 'up' : 'right'}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path
        d={props.expanded ? 'M4 10L8 6L12 10' : 'M6 4L10 8L6 12'}
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
  );
}

function LegacyComponentPage(props: {
  readonly fixture: ComponentFixture;
  readonly theme: AuditTheme;
  readonly onThemeChange: (theme: AuditTheme) => void;
}): JSX.Element {
  const reportDemoAction = useDemoActionFeedback();
  return (
    <>
      <div class="component-audit__quickstart">
        <span>Load the default theme once</span>
        <SyntaxCode code="import 'wheel/components/styles';" language="typescript" />
        {/* wheel-raw-anchor: the guide is in the separate documentation entry point. */}
        <Button href="/docs/#/component-library" size="sm" variant="ghost">
          Setup and theming →
        </Button>
      </div>

      <section class="component-audit__panel" aria-labelledby="preview-title">
        <div class="component-audit__panel-header">
          <div>
            <span>Interactive preview</span>
            <h2 id="preview-title">{props.fixture.name}</h2>
          </div>
          <ThemePicker
            theme={props.theme}
            themes={themes}
            onThemeChange={props.onThemeChange}
          />
        </div>

        <div
          class="component-audit__preview"
          classList={{ 'component-audit__preview--custom': props.theme === 'custom' }}
          data-theme={props.theme === 'dark' ? 'dark' : 'light'}
          data-testid="audit-preview"
          use:demoActionSurface={reportDemoAction}
        >
          <Dynamic component={props.fixture.component} />
        </div>
      </section>

      <AuditEvidence fixture={props.fixture} />
    </>
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
          <dd>
            <SyntaxCode
              code={`import { ${props.fixture.name} } from 'wheel/components/${props.fixture.slug}';`}
              language="typescript"
            />
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            <SyntaxCode code={`packages/wheel/src/components/${props.fixture.slug}/index.ts`} />
          </dd>
        </div>
        <div>
          <dt>Demo</dt>
          <dd>
            <SyntaxCode code={`packages/playground/src/component-demos/${demoSlug()}.tsx`} />
          </dd>
        </div>
        <div>
          <dt>Guide</dt>
          {/* wheel-raw-anchor: the guide is in the separate documentation entry point. */}
          <dd>
            <Button href="/docs/#/component-library" size="sm" variant="ghost">
              Setup, themes, and CSS overrides
            </Button>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function SyntaxCode(props: {
  readonly code: string;
  readonly language?: string | undefined;
}): JSX.Element {
  const language = () => props.language ?? 'plaintext';
  return (
    <Code
      code={props.code}
      highlightedHtml={highlightSyntax(props.code, language())}
      language={language()}
    />
  );
}
