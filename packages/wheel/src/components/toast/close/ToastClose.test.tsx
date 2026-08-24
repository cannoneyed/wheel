// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { Toast } from '../index';
import { List, Button } from '../utils/test-utils';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

describe('<Toast.Close />', () => {
  // Upstream also runs `describeConformance(<Toast.Close />, ...)`, a React/MUI-only test utility
  // (ref instanceof checks, root class name, etc.) that has no Solid equivalent in this repo —
  // behavior it exercises (rendering a native `<button>`, forwarding `class`/`ref`) is covered by
  // the tests below and by `renderElement`'s own test suite.

  it('closes the toast when clicked', () => {
    render(() => (
      <Toast.Provider>
        <Toast.Viewport data-testid="viewport">
          <List />
        </Toast.Viewport>
        <Button />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });
    const viewport = screen.getByTestId('viewport');

    fireEvent.click(button);

    expect(screen.getByTestId('title')).not.toBe(null);

    viewport.focus();

    const closeButton = screen.getByRole('button', { name: 'close-press' });

    fireEvent.click(closeButton);

    expect(screen.queryByTestId('title')).toBe(null);
  });
});
