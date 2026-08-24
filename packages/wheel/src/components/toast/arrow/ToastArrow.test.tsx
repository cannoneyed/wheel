// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Toast } from '../index';

const toast: Toast.Root.ToastObject = {
  id: 'test',
  title: 'Toast title',
};

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

describe('<Toast.Arrow />', () => {
  // Upstream also runs `describeConformance(<Toast.Arrow />, ...)`, a React/MUI-only test utility
  // (ref instanceof checks, root class name, etc.) that has no Solid equivalent in this repo (see
  // `Button.test.tsx`'s note). Rendering a plain `<div>` positioned against the toast anchor is
  // covered by the smoke test below and by `ToastPositioner`'s own tests.
  it('renders a positioned arrow element', () => {
    render(() => (
      <Toast.Provider>
        <Toast.Positioner toast={toast}>
          <Toast.Arrow data-testid="arrow" />
        </Toast.Positioner>
      </Toast.Provider>
    ));

    const arrow = screen.getByTestId('arrow');
    expect(arrow.tagName).toBe('DIV');
    expect(arrow).toHaveAttribute('aria-hidden', 'true');
  });
});
