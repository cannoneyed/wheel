/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
import { viewRoot } from 'wheel/core';
import { Code, CodeBlock } from 'wheel/components';
import { DemoGroup } from './demo-group';
import { highlightSyntax } from '../syntax-highlight';

const blockSource = `type Project = {
  id: string;
  archived: boolean;
};

const project: Project = {
  id: 'wheel',
  archived: false,
};`;

const inlineSource = "'primary' | 'secondary' | 'ghost'";

export default function ExampleCodeBlock() {
  return (
    <div use:viewRoot={'ExampleCodeBlock'} class="code-block-demo">
      <DemoGroup title="Block">
        <CodeBlock
          code={blockSource}
          highlightedHtml={highlightSyntax(blockSource, 'typescript')}
          label="Project type example"
          language="typescript"
        />
      </DemoGroup>
      <DemoGroup title="Wrapping and inline">
        <CodeBlock
          code="const longDescription = 'A source line can wrap when horizontal scrolling would hide important context.';"
          highlightedHtml={highlightSyntax(
            "const longDescription = 'A source line can wrap when horizontal scrolling would hide important context.';",
            'typescript',
          )}
          language="typescript"
          wrap
        />
        <p>
          Variant: {' '}
          <Code
            code={inlineSource}
            highlightedHtml={highlightSyntax(inlineSource, 'typescript')}
            language="typescript"
          />
        </p>
      </DemoGroup>
    </div>
  );
}
