import type { ComponentReferenceDefinition, ComponentReferenceProp } from './component-reference';
import { ASTRYX_COMPONENT_DEFINITIONS } from './astryx-component-definitions';
import { ASTRYX_COMPONENT_FIXTURES } from './astryx-component-fixtures';

const commonProps: readonly ComponentReferenceProp[] = [
  { name: 'size', type: "'sm' | 'md' | 'lg'", defaultValue: "'md'", description: 'Uses the shared control and type scale.' },
  { name: 'tone', type: "'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'error'", defaultValue: "'neutral'", description: 'Applies one semantic color contract.' },
  { name: 'density', type: "'compact' | 'balanced' | 'spacious'", defaultValue: "'compact'", description: 'Changes token-based gaps without changing behavior.' },
  { name: 'orientation', type: "'horizontal' | 'vertical'", defaultValue: "'vertical'", description: 'Sets the primary layout axis where the component has one.' },
  { name: 'variant', type: 'string', defaultValue: '—', description: 'Selects a component-specific treatment.' },
  { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Blocks native activation and exposes disabled state.' },
  { name: 'as / asChild', type: 'ElementType / boolean', defaultValue: '— / false', description: 'Changes the semantic element without adding a wrapper.' },
  { name: 'class / style', type: 'value | state function', defaultValue: '—', description: 'Styles the part from its resolved design state.' },
];

const fixtures = new Map(ASTRYX_COMPONENT_FIXTURES.map((fixture) => [fixture.slug, fixture]));
const childless = new Set([
  'avatar-status-dot',
  'indicator',
  'skeleton',
  'spinner',
  'status-dot',
  'text-area',
]);

export const ASTRYX_COMPONENT_REFERENCES: Readonly<Record<string, ComponentReferenceDefinition>> =
  Object.fromEntries(ASTRYX_COMPONENT_DEFINITIONS.map((definition) => {
    const fixture = fixtures.get(definition.slug)!;
    const usageCode = definition.slug === 'code'
      ? `import { Code } from 'wheel/components';\n\n<Code code="const density = 'compact';" language="typescript" />`
      : childless.has(definition.slug)
      ? `import { ${definition.name} } from 'wheel/components';\n\n<${definition.name} tone="accent" size="md" />`
      : `import { ${definition.name} } from 'wheel/components';\n\n<${definition.name} tone="accent" density="compact">\n  ${definition.name} content\n</${definition.name}>`;
    return [definition.slug, {
      usageCode,
      props: commonProps,
      examples: [{
        title: `${definition.name} compositions`,
        description: definition.summary,
        code: usageCode,
        component: fixture.component,
      }],
    }];
  }));
