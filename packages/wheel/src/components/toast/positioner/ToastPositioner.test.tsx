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

describe('<Toast.Positioner />', () => {
  // Upstream also runs `describeConformance(<Toast.Positioner toast={toast} />, ...)`, a
  // React/MUI-only test utility (ref instanceof checks, root class name, etc.) that has no Solid
  // equivalent in this repo (see `Button.test.tsx`'s note). Rendering a positioned `<div>` is
  // covered by the smoke test below and by `ToastArrow`'s own tests.
  it('renders a positioned div for the given toast', () => {
    render(() => (
      <Toast.Provider>
        <Toast.Positioner toast={toast} data-testid="positioner" />
      </Toast.Provider>
    ));

    const positioner = screen.getByTestId('positioner');
    expect(positioner.tagName).toBe('DIV');
    expect(positioner).toHaveAttribute('data-side');
    expect(positioner).toHaveAttribute('data-align');
  });
});
