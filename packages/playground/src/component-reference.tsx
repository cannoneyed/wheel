/* eslint-disable wheel/require-view-root -- ComponentAudit owns this nested documentation surface. */
import { Dynamic } from 'solid-js/web';
import { For, type JSX } from 'solid-js';
import { Code, CodeBlock, Toggle, ToggleGroup } from 'wheel/components';

import { demoActionSurface, useDemoActionFeedback } from './demo-feedback';
import { highlightSyntax } from './syntax-highlight';

export type ComponentReferenceTheme = 'light' | 'dark' | 'custom';

export interface ComponentReferenceProp {
  readonly name: string;
  readonly type: string;
  readonly defaultValue: string;
  readonly description: string;
}

export interface ComponentReferenceExample {
  readonly title: string;
  readonly description: string;
  readonly code: string;
  readonly component: () => JSX.Element;
}

export interface ComponentReferenceDefinition {
  readonly usageCode: string;
  readonly props: readonly ComponentReferenceProp[];
  readonly examples: readonly ComponentReferenceExample[];
}

interface ComponentReferencePageProps {
  readonly componentName: string;
  readonly component: () => JSX.Element;
  readonly reference: ComponentReferenceDefinition;
  readonly theme: ComponentReferenceTheme;
  readonly themes: readonly ComponentReferenceTheme[];
  readonly onThemeChange: (theme: ComponentReferenceTheme) => void;
}

/** Renders the shared reference-page structure used as component docs are ported. */
export function ComponentReferencePage(props: ComponentReferencePageProps): JSX.Element {
  const previewTheme = () => (props.theme === 'dark' ? 'dark' : 'light');
  const customClass = () => props.theme === 'custom';
  const reportDemoAction = useDemoActionFeedback();

  return (
    <div class="component-reference">
      <section class="component-reference__stage" aria-label="Interactive preview">
        <div class="component-reference__stage-tools">
          <ThemePicker
            theme={props.theme}
            themes={props.themes}
            onThemeChange={props.onThemeChange}
          />
        </div>
        <div
          class="component-audit__preview component-reference__stage-preview"
          classList={{ 'component-audit__preview--custom': customClass() }}
          data-theme={previewTheme()}
          data-testid="audit-preview"
          use:demoActionSurface={reportDemoAction}
        >
          <Dynamic component={props.component} />
        </div>
      </section>

      <section class="component-reference__section" aria-labelledby="usage-title">
        <ReferenceSectionHeader eyebrow="Guidance" title="Usage" id="usage-title" />
        <CodeBlock
          class="component-reference__code"
          code={props.reference.usageCode}
          highlightedHtml={highlightSyntax(props.reference.usageCode, 'tsx')}
          label={`${props.componentName} usage`}
          language="tsx"
        />
      </section>

      <section class="component-reference__section" aria-labelledby="props-title">
        <ReferenceSectionHeader
          eyebrow="API"
          title="Props"
          id="props-title"
          description="Component-specific props. Native element and shared composition props also pass through."
        />
        <div class="component-reference__table-scroll">
          <table class="component-reference__table component-reference__props-table">
            <thead>
              <tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr>
            </thead>
            <tbody>
              <For each={props.reference.props}>
                {(prop) => (
                  <tr>
                    <th scope="row">
                      <Code code={prop.name} />
                    </th>
                    <td>
                      <Code
                        code={prop.type}
                        highlightedHtml={highlightSyntax(prop.type, 'typescript')}
                        language="typescript"
                      />
                    </td>
                    <td>
                      <Code
                        code={prop.defaultValue}
                        highlightedHtml={highlightSyntax(prop.defaultValue, 'typescript')}
                        language="typescript"
                      />
                    </td>
                    <td>{prop.description}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>

      <section class="component-reference__section" aria-labelledby="examples-title">
        <ReferenceSectionHeader
          eyebrow="Patterns"
          title="Examples"
          id="examples-title"
          description="Copy these complete patterns, then replace the labels and actions."
        />
        <div class="component-reference__examples">
          <For each={props.reference.examples}>
            {(example) => (
              <article class="component-reference__example">
                <header>
                  <h3>{example.title}</h3>
                  <p>{example.description}</p>
                </header>
                <div class="component-reference__example-grid">
                  <div
                    class="component-reference__example-preview"
                    classList={{ 'component-audit__preview--custom': customClass() }}
                    data-theme={previewTheme()}
                    use:demoActionSurface={reportDemoAction}
                  >
                    <Dynamic component={example.component} />
                  </div>
                  <CodeBlock
                    class="component-reference__code"
                    code={example.code}
                    highlightedHtml={highlightSyntax(example.code, 'tsx')}
                    label={`${example.title} code`}
                    language="tsx"
                  />
                </div>
              </article>
            )}
          </For>
        </div>
      </section>

    </div>
  );
}

function ReferenceSectionHeader(props: {
  readonly eyebrow: string;
  readonly title: string;
  readonly id: string;
  readonly description?: string | undefined;
  readonly children?: JSX.Element;
}): JSX.Element {
  return (
    <header class="component-reference__section-header">
      <div>
        <span>{props.eyebrow}</span>
        <h2 id={props.id}>{props.title}</h2>
        {props.description ? <p>{props.description}</p> : null}
      </div>
      {props.children}
    </header>
  );
}

export function ThemePicker(props: {
  readonly theme: ComponentReferenceTheme;
  readonly themes: readonly ComponentReferenceTheme[];
  readonly onThemeChange: (theme: ComponentReferenceTheme) => void;
}): JSX.Element {
  return (
    <ToggleGroup<ComponentReferenceTheme>
      class="component-audit__themes"
      aria-label="Preview theme"
      size="sm"
      value={props.theme}
      onValueChange={(value) => {
        if (value !== null) {
          props.onThemeChange(value);
        }
      }}
    >
      <For each={props.themes}>
        {(value) => (
          <Toggle
            value={value}
            label={`${value} preview`}
            data-testid={`audit-theme-${value}`}
          >
            {value}
          </Toggle>
        )}
      </For>
    </ToggleGroup>
  );
}
