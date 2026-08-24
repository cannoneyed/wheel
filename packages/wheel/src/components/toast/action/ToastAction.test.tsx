// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { Toast } from '../index';
import { List, Button } from '../utils/test-utils';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

describe('<Toast.Action />', () => {
  // Upstream also runs `describeConformance(<Toast.Action>action</Toast.Action>, ...)`, a
  // React/MUI-only test utility (ref instanceof checks, root class name, etc.) that has no Solid
  // equivalent in this repo — behavior it exercises (rendering a native `<button>`, forwarding
  // `class`/`ref`) is covered by the tests below and by `renderElement`'s own test suite.

  it('performs an action when clicked', () => {
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

    expect(screen.getByTestId('action').id).toBe('action');
  });

  it('does not render if it has no children', () => {
    function AddButton() {
      const { add } = Toast.useToastManager();
      return (
        <button
          type="button"
          onClick={() =>
            add({
              actionProps: {
                children: undefined,
              },
            })
          }
        >
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

    const actionElement = screen.queryByTestId('action');
    expect(actionElement).toBe(null);
  });
});
