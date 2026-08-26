import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { Code, CodeBlock } from './CodeBlock';

describe('CodeBlock', () => {
  it('renders accessible plain source through stable recipe identities', () => {
    render(() => <CodeBlock code="const ready = true;" language="typescript" label="Example" />);

    const block = screen.getByLabelText('Example');
    expect(block).toHaveClass('wheel-CodeBlock');
    expect(block).toHaveAttribute('data-slot', 'code-block');
    expect(block).toHaveAttribute('data-language', 'typescript');
    expect(block).toHaveTextContent('const ready = true;');
    expect(block.querySelector('code')).toHaveClass('wheel-Code');
  });

  it('renders trusted syntax tokens without losing the source text', () => {
    render(() => (
      <CodeBlock
        code="const ready = true;"
        highlightedHtml={
          '<span class="wheel-Code-token wheel-Code-token--keyword">const</span> ready = true;'
        }
      />
    ));

    expect(screen.getByText('const')).toHaveClass('wheel-Code-token--keyword');
    expect(screen.getByText('const').closest('pre')).toHaveTextContent('const ready = true;');
  });

  it('exposes wrapping and supports inline Code', () => {
    const { container } = render(() => (
      <>
        <CodeBlock code="type Value = string;" wrap />
        <Code code="string" language="typescript" data-testid="inline-code" />
      </>
    ));

    expect(container.querySelector('pre')).toHaveAttribute('data-wrap');
    expect(screen.getByTestId('inline-code')).toHaveClass('wheel-Code');
    expect(screen.getByTestId('inline-code')).toHaveAttribute('data-slot', 'code');
  });
});
