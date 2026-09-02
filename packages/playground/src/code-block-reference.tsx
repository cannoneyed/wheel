/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
/* eslint-disable wheel/require-view-root -- ComponentReferencePage owns these nested examples. */
import { Code, CodeBlock } from 'wheel/components';
import type { ComponentReferenceDefinition } from './component-reference';
import { highlightSyntax } from './syntax-highlight';

const source = `import { CodeBlock } from 'wheel/components';

<CodeBlock
  code="const ready = true;"
  highlightedHtml={highlightedHtml}
  language="typescript"
  label="Ready state"
/>`;

function BlockExample() {
  return (
    <CodeBlock
      code="const ready = true;"
      highlightedHtml={highlightSyntax('const ready = true;', 'typescript')}
      language="typescript"
      label="Ready state"
    />
  );
}

function InlineExample() {
  return (
    <p>
      The value is{' '}
      <Code
        code="true"
        highlightedHtml={highlightSyntax('true', 'typescript')}
        language="typescript"
      />
      .
    </p>
  );
}

export const CODE_BLOCK_REFERENCE: ComponentReferenceDefinition = {
  usageCode: source,
  props: [
    { name: 'code', type: 'string', defaultValue: '—', description: 'Required source text and plain fallback.' },
    { name: 'highlightedHtml', type: 'string', defaultValue: '—', description: 'Trusted token markup generated from code.' },
    { name: 'language', type: 'string', defaultValue: '—', description: 'Exposes the syntax language for inspection.' },
    { name: 'label', type: 'string', defaultValue: '—', description: 'Names the block for assistive technology.' },
    { name: 'wrap', type: 'boolean', defaultValue: 'false', description: 'Wraps long source lines instead of scrolling.' },
    { name: 'class', type: 'string | (state) => string', defaultValue: '—', description: 'Adds a class from resolved state.' },
    { name: 'style', type: 'CSSProperties | (state) => CSSProperties', defaultValue: '—', description: 'Adds inline styles from resolved state.' },
  ],
  examples: [
    {
      title: 'Highlighted TypeScript',
      description: 'Pass escaped syntax-token markup from the application highlighter.',
      code: `<CodeBlock
  code="const ready = true;"
  highlightedHtml={highlightedHtml}
  language="typescript"
/>`,
      component: BlockExample,
    },
    {
      title: 'Inline code',
      description: 'Use Code for a source token inside prose or a data table.',
      code: `<p>The value is <Code code="true" highlightedHtml={highlightedHtml} /></p>`,
      component: InlineExample,
    },
  ],
};
