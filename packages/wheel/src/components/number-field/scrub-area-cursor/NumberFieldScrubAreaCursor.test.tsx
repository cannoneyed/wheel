// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { platform } from '../../base-utils/platform/index';
import { NumberField } from '../index';

/**
 * Solid port of upstream's `NumberFieldScrubAreaCursor.test.tsx`. `describeConformance` is
 * upstream's shared React-only conformance harness with no Solid equivalent, so only behavioral
 * tests carry over. This component doesn't render on WebKit — mirrors upstream's
 * `describe.skipIf(isWebKit)`.
 */
const isWebKit = platform.engine.webkit;

afterEach(cleanup);

describe.skipIf(isWebKit)('<NumberField.ScrubAreaCursor />', () => {
  it('has presentation role', () => {
    render(() => (
      <NumberField.Root>
        <NumberField.ScrubArea />
      </NumberField.Root>
    ));
    expect(screen.queryByRole('presentation')).not.toBe(null);
  });

  it('renders when using mouse input', async () => {
    const originalRequestPointerLock = Element.prototype.requestPointerLock;

    try {
      Element.prototype.requestPointerLock = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(() => (
        <NumberField.Root>
          <NumberField.Input />
          <NumberField.ScrubArea data-testid="scrub-area">
            <NumberField.ScrubAreaCursor data-testid="scrub-area-cursor" />
          </NumberField.ScrubArea>
        </NumberField.Root>
      ));

      const scrubArea = screen.getByTestId('scrub-area');

      await user.pointer({ target: scrubArea, keys: '[MouseLeft>]', pointerName: 'mouse' });
      await new Promise((resolve) => {
        setTimeout(resolve, 25);
      });

      expect(screen.queryByTestId('scrub-area-cursor')).not.toBe(null);
    } finally {
      Element.prototype.requestPointerLock = originalRequestPointerLock;
    }
  });

  it('only renders a cursor for the active scrub area', async () => {
    const originalRequestPointerLock = Element.prototype.requestPointerLock;

    try {
      Element.prototype.requestPointerLock = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(() => (
        <NumberField.Root>
          <NumberField.Input />
          <NumberField.ScrubArea data-testid="scrub-area-1">
            <NumberField.ScrubAreaCursor data-testid="scrub-area-cursor" />
          </NumberField.ScrubArea>
          <NumberField.ScrubArea data-testid="scrub-area-2">
            <NumberField.ScrubAreaCursor data-testid="scrub-area-cursor" />
          </NumberField.ScrubArea>
        </NumberField.Root>
      ));

      const firstScrubArea = screen.getByTestId('scrub-area-1');

      await user.pointer({ target: firstScrubArea, keys: '[MouseLeft>]', pointerName: 'mouse' });
      await new Promise((resolve) => {
        setTimeout(resolve, 25);
      });

      expect(screen.queryAllByTestId('scrub-area-cursor')).toHaveLength(1);
    } finally {
      Element.prototype.requestPointerLock = originalRequestPointerLock;
    }
  });

  it('does not render when using touch input', async () => {
    const user = userEvent.setup();

    render(() => (
      <NumberField.Root>
        <NumberField.ScrubArea>
          <NumberField.ScrubAreaCursor data-testid="scrub-area-cursor" />
        </NumberField.ScrubArea>
      </NumberField.Root>
    ));

    const scrubArea = screen.getByRole('presentation');

    await user.pointer({ target: scrubArea, keys: '[TouchA>]', pointerName: 'touch' });
    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });

    expect(screen.queryByTestId('scrub-area-cursor')).toBe(null);
  });

  it('handles pointer lock denial through requestPointerLock API', async () => {
    const originalRequestPointerLock = Element.prototype.requestPointerLock;

    try {
      const requestLockStub = vi.fn(() => {
        throw new Error('User denied pointer lock');
      });
      Element.prototype.requestPointerLock =
        requestLockStub as typeof Element.prototype.requestPointerLock;
      const user = userEvent.setup();

      render(() => (
        <NumberField.Root>
          <NumberField.ScrubArea>
            <NumberField.ScrubAreaCursor data-testid="scrub-area-cursor" />
          </NumberField.ScrubArea>
        </NumberField.Root>
      ));

      const scrubArea = screen.getByRole('presentation');

      await user.pointer({ target: scrubArea, keys: '[MouseLeft>]', pointerName: 'mouse' });
      await new Promise((resolve) => {
        setTimeout(resolve, 25);
      });

      expect(screen.queryByTestId('scrub-area-cursor')).toBe(null);
      expect(requestLockStub).toHaveBeenCalled();
    } finally {
      Element.prototype.requestPointerLock = originalRequestPointerLock;
    }
  });

  it('does not render after a quick tap when pointer lock resolves later', async () => {
    const originalRequestPointerLock = Element.prototype.requestPointerLock;

    try {
      // Simulate pointer lock resolving after the user already released the pointer (tap)
      Element.prototype.requestPointerLock = vi.fn().mockReturnValue(
        new Promise((resolve) => {
          setTimeout(resolve, 30);
        }),
      );
      const user = userEvent.setup();

      render(() => (
        <NumberField.Root>
          <NumberField.Input />
          <NumberField.ScrubArea data-testid="scrub-area">
            <NumberField.ScrubAreaCursor data-testid="scrub-area-cursor" />
          </NumberField.ScrubArea>
        </NumberField.Root>
      ));

      const scrubArea = screen.getByTestId('scrub-area');

      // Quick press and release (tap)
      await user.pointer({ target: scrubArea, keys: '[MouseLeft>]', pointerName: 'mouse' });
      await user.pointer({ target: scrubArea, keys: '[/MouseLeft]', pointerName: 'mouse' });
      window.dispatchEvent(new Event('pointerup'));
      // Wait longer than the delayed pointer lock resolution
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      // After a tap, the scrub cursor should not remain rendered
      expect(screen.queryByTestId('scrub-area-cursor')).toBe(null);
    } finally {
      Element.prototype.requestPointerLock = originalRequestPointerLock;
    }
  });
});
