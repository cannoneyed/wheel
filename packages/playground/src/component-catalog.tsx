/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
// wheel-view-root: catalog cards are proof harnesses, not application views.
import { For, type JSX } from 'solid-js';
import { viewRoot } from 'wheel/core';
import { Button, Popover } from 'wheel/components';

import { COMPONENT_FIXTURES } from './component-fixtures';

const entries = COMPONENT_FIXTURES;

const customEntries = entries.filter((entry) =>
  [
    'Button',
    'ButtonGroup',
    'Checkbox',
    'CheckboxGroup',
    'CheckboxList',
    'CheckboxListItem',
    'CodeBlock',
    'IconButton',
    'Input',
    'Switch',
    'Toggle',
    'ToggleGroup',
  ].includes(entry.name),
);

/** Shows every component family with only the default Wheel recipe classes. */
export function ComponentCatalog(): JSX.Element {
  return (
    <div use:viewRoot={'ComponentCatalog'} class="component-catalog" data-testid="component-catalog">
      <For each={['light', 'dark'] as const}>
        {(theme) => (
          <section class="component-theme" data-theme={theme} data-testid={`catalog-${theme}`}>
            <header>
              <div>
                <p>Wheel components</p>
                <h2>{theme} theme</h2>
              </div>
              <span>{COMPONENT_FIXTURES.length} component pages</span>
            </header>
            <div class="component-grid">
              <For each={entries}>
                {(entry) => {
                  const Demo = entry.component;
                  return (
                    <article data-family={entry.name}>
                      <h3>{entry.name}</h3>
                      <div class="component-demo">
                        <Demo />
                      </div>
                    </article>
                  );
                }}
              </For>
            </div>
          </section>
        )}
      </For>
      <section
        class="component-theme component-theme--custom"
        data-theme="light"
        data-testid="catalog-custom"
      >
        <header>
          <div>
            <p>Scoped token override</p>
            <h2>custom theme</h2>
          </div>
          <span>{customEntries.length} families</span>
        </header>
        <div class="component-grid">
          <For each={customEntries}>
            {(entry) => {
              const Demo = entry.component;
              return (
                <article data-family={entry.name}>
                  <h3>{entry.name}</h3>
                  <div class="component-demo">
                    <Demo />
                  </div>
                </article>
              );
            }}
          </For>
        </div>
      </section>
      <BrowserFixtures />
    </div>
  );
}

/** Keeps browser-only portal interactions available without changing a family demo. */
function BrowserFixtures(): JSX.Element {
  return (
    <section class="browser-fixtures" aria-label="Browser interaction fixtures">
      <Button data-testid="outside-target">
        Outside target
      </Button>
      <Popover.Root defaultOpen>
        <Popover.Trigger data-testid="parent-trigger">Parent popover</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner>
            <Popover.Popup data-testid="parent-popup">
              <Popover.Root>
                <Popover.Trigger data-testid="child-trigger">Child popover</Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner>
                    <Popover.Popup data-testid="child-popup">Child content</Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </section>
  );
}
