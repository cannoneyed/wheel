/* eslint-disable wheel/require-view-root -- The component catalog owns this generated fixture boundary. */
import { For, type Component, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import * as WheelComponents from 'wheel/components';

import type { ComponentFixture } from './component-fixtures';
import {
  ASTRYX_COMPONENT_DEFINITIONS,
  type AstryxComponentDefinition,
} from './astryx-component-definitions';
import { DemoGroup } from './component-demos/demo-group';

interface GeneratedProps {
  readonly children?: JSX.Element;
  readonly tone?: 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'error';
  readonly size?: 'sm' | 'md' | 'lg';
  readonly density?: 'compact' | 'balanced' | 'spacious';
  readonly orientation?: 'horizontal' | 'vertical';
  readonly variant?: string;
  readonly href?: string;
  readonly value?: string;
  readonly 'aria-label'?: string;
}

const components = WheelComponents as unknown as Record<string, Component<GeneratedProps>>;
const familyIndexes = new Map<string, number>();
const existingFamilyOffsets: Readonly<Record<string, number>> = {
  Avatar: 1,
  Dialog: 1,
  Field: 1,
  Select: 1,
};

export const ASTRYX_COMPONENT_FIXTURES: readonly ComponentFixture[] =
  ASTRYX_COMPONENT_DEFINITIONS.map((definition) => {
    const familyIndex = familyIndexes.get(definition.family) ?? 0;
    familyIndexes.set(definition.family, familyIndex + 1);
    return {
      name: definition.name,
      slug: definition.slug,
      group: definition.group,
      family: definition.family,
      familyOrder: familyIndex + (existingFamilyOffsets[definition.family] ?? 0),
      summary: definition.summary,
      component: () => <GeneratedAstryxDemo definition={definition} />,
      browserCheck: 'Generated API, grouping, and visual baseline',
    };
  });

function GeneratedAstryxDemo(props: {
  readonly definition: AstryxComponentDefinition;
}): JSX.Element {
  const component = () => components[props.definition.name]!;
  const compactContent = () => sampleContent(props.definition);

  if (props.definition.name === 'Code') {
    return (
      <div class="astryx-generated-demo astryx-generated-demo--compact">
        <DemoGroup title="Inline code">
          <WheelComponents.Code code="const density = 'compact';" language="typescript" />
          <WheelComponents.Code code="wheel/components" />
        </DemoGroup>
      </div>
    );
  }

  if (props.definition.name === 'Spinner' || props.definition.name === 'Skeleton') {
    return (
      <div class="astryx-generated-demo astryx-generated-demo--compact">
        <DemoGroup title="Sizes">
          <For each={['sm', 'md', 'lg'] as const}>
            {(size) => <Dynamic component={component()} size={size} aria-label={`${size} ${props.definition.name}`} />}
          </For>
        </DemoGroup>
      </div>
    );
  }

  if (props.definition.name === 'StatusDot' || props.definition.name === 'AvatarStatusDot' || props.definition.name === 'Indicator') {
    return (
      <div class="astryx-generated-demo astryx-generated-demo--compact">
        <DemoGroup title="Semantic states">
          <For each={['neutral', 'accent', 'success', 'warning', 'error'] as const}>
            {(tone) => (
              <span class="astryx-generated-demo__labeled-state">
                <Dynamic component={component()} tone={tone} aria-label={tone} />
                {tone}
              </span>
            )}
          </For>
        </DemoGroup>
      </div>
    );
  }

  return (
    <div class="astryx-generated-demo">
      <DemoGroup title="Variants">
        <For each={['neutral', 'accent', 'success', 'warning', 'error'] as const}>
          {(tone) => (
            <Dynamic
              component={component()}
              tone={tone}
              href={props.definition.tag === 'a' ? `#${props.definition.slug}-${tone}` : undefined}
              aria-label={`${props.definition.name} ${tone}`}
            >
              {compactContent()}
            </Dynamic>
          )}
        </For>
      </DemoGroup>
      <DemoGroup title="Density and direction">
        <Dynamic component={component()} density="compact" orientation="horizontal">
          {expandedContent(props.definition)}
        </Dynamic>
      </DemoGroup>
    </div>
  );
}

function sampleContent(definition: AstryxComponentDefinition): JSX.Element {
  switch (definition.name) {
    case 'Table':
      return (
        <tbody>
          <tr><th scope="row">Alpha</th><td>Active</td><td>24</td></tr>
          <tr><th scope="row">Beta</th><td>Paused</td><td>8</td></tr>
        </tbody>
      );
    case 'List':
    case 'ChatMessageList':
    case 'Stepper':
      return <li>{definition.name} item</li>;
    case 'MetadataList':
      return <><dt>Owner</dt><dd>Design systems</dd></>;
    case 'Calendar':
      return <For each={Array.from({ length: 28 }, (_, index) => index + 1)}>{(day) => <span>{day}</span>}</For>;
    case 'TextArea':
      return undefined;
    default:
      return definition.name;
  }
}

function expandedContent(definition: AstryxComponentDefinition): JSX.Element {
  switch (definition.group) {
    case 'Navigation':
      return <><a href={`#${definition.slug}-one`}>Overview</a><a href={`#${definition.slug}-two`}>Details</a></>;
    case 'Forms':
      return <><span>Label</span><WheelComponents.Input aria-label={`${definition.name} example`} placeholder="Enter a value" /></>;
    case 'Feedback':
      return <><strong>{definition.name}</strong><span>{definition.summary}</span></>;
    case 'Data display':
      return <><strong>Current value</strong><span>42</span></>;
    case 'Product patterns':
      return <><span class="astryx-generated-demo__avatar" aria-hidden="true">W</span><span>{definition.summary}</span></>;
    default:
      return <><strong>{definition.name}</strong><span>{definition.summary}</span></>;
  }
}
