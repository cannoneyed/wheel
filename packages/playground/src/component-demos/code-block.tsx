/* eslint-disable wheel/require-view-root -- The catalog owns this fixture's inspection boundary. */
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
    <div class="code-block-demo">
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
