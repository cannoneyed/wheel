// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { Toast } from '../index';
import { List, Button } from '../utils/test-utils';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

describe('<Toast.Title />', () => {
  // Upstream also runs `describeConformance(<Toast.Title>title</Toast.Title>, ...)`, a
  // React/MUI-only test utility (ref instanceof checks, root class name, etc.) that has no Solid
  // equivalent in this repo — behavior it exercises (rendering a native `<h2>`, forwarding
  // `class`/`ref`) is covered by the tests below and by `renderElement`'s own test suite.

  it('adds aria-labelledby to the root element', () => {
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

    const titleElement = screen.getByTestId('title');
    const titleId = titleElement.id;

    const rootElement = screen.getByTestId('root');
    expect(rootElement).not.toBe(null);
    expect(rootElement.getAttribute('aria-labelledby')).toBe(titleId);
  });

  it('does not render if it has no children', () => {
    function AddButton() {
      const { add } = Toast.useToastManager();
      return (
        <button type="button" onClick={() => add({ title: undefined })}>
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

    const titleElement = screen.queryByTestId('title');
    expect(titleElement).toBe(null);
  });

  it('renders the title by default', () => {
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

    const titleElement = screen.getByTestId('title');
    expect(titleElement).not.toBe(null);
    expect(titleElement.textContent).toBe('title');
  });
});
