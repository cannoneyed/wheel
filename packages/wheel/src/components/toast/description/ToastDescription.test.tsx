// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { Toast } from '../index';
import { List, Button } from '../utils/test-utils';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

describe('<Toast.Description />', () => {
  // Upstream also runs `describeConformance(<Toast.Description>description</Toast.Description>,
  // ...)`, a React/MUI-only test utility (ref instanceof checks, root class name, etc.) that has no
  // Solid equivalent in this repo — behavior it exercises (rendering a native `<p>`, forwarding
  // `class`/`ref`) is covered by the tests below and by `renderElement`'s own test suite.

  it('adds aria-describedby to the root element', () => {
    render(() => (
      <Toast.Provider>
        <Toast.Viewport>
          <List />
        </Toast.Viewport>
        <Button />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });
    fireEvent.click(button);

    const descriptionElement = screen.getByTestId('description');
    const descriptionId = descriptionElement.id;

    const rootElement = screen.getByTestId('root');
    expect(rootElement).not.toBe(null);
    expect(rootElement.getAttribute('aria-describedby')).toBe(descriptionId);
  });

  it('does not render if it has no children', () => {
    function AddButton() {
      const { add } = Toast.useToastManager();
      return (
        <button type="button" onClick={() => add({ description: undefined })}>
          add
        </button>
      );
    }

    render(() => (
      <Toast.Provider>
        <Toast.Viewport>
          <List />
        </Toast.Viewport>
        <AddButton />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });
    fireEvent.click(button);

    const descriptionElement = screen.queryByTestId('description');
    expect(descriptionElement).toBe(null);
  });

  it('renders the description by default', () => {
    render(() => (
      <Toast.Provider>
        <Toast.Viewport>
          <List />
        </Toast.Viewport>
        <Button />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });
    fireEvent.click(button);

    const descriptionElement = screen.getByTestId('description');
    expect(descriptionElement).not.toBe(null);
    expect(descriptionElement.textContent).toBe('description');
  });
});
