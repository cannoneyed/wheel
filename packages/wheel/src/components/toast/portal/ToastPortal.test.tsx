// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Toast } from '../index';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

describe('<Toast.Portal />', () => {
  // Upstream also runs `describeConformance(<Toast.Portal />, ...)`, a React/MUI-only test utility
  // (ref instanceof checks, root class name, etc.) that has no Solid equivalent in this repo (see
  // `Button.test.tsx`'s note). Rendering a plain `<div>` into `document.body` is covered by the
  // smoke test below and by `useFloatingPortalNode`'s own test suite.
  it('renders its children into document.body', () => {
    render(() => (
      <Toast.Portal>
        <div data-testid="content">content</div>
      </Toast.Portal>
    ));

    const content = screen.getByTestId('content');
    expect(document.body.contains(content)).toBe(true);
  });
});
