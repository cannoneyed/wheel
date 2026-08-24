// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@solidjs/testing-library';
import { ScrollArea } from '../index';

afterEach(cleanup);

describe('<ScrollArea.Content />', () => {
  it('renders a div with role="presentation" and forwards its children', () => {
    const { getByTestId, getByText } = render(() => (
      <ScrollArea.Root>
        <ScrollArea.Viewport>
          <ScrollArea.Content data-testid="content">
            <div>content</div>
          </ScrollArea.Content>
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    ));

    const content = getByTestId('content');
    expect(content.tagName).toBe('DIV');
    expect(content).toHaveAttribute('role', 'presentation');
    expect(getByText('content')).toBeTruthy();
  });

  it('does not add overflow data attributes when there is no measured overflow', () => {
    const { getByTestId } = render(() => (
      <ScrollArea.Root>
        <ScrollArea.Viewport>
          <ScrollArea.Content data-testid="content">
            <div />
          </ScrollArea.Content>
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    ));

    const content = getByTestId('content');
    expect(content).not.toHaveAttribute('data-has-overflow-x');
    expect(content).not.toHaveAttribute('data-has-overflow-y');
  });
});
