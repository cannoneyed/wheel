// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSignal, Show } from 'solid-js';
import { cleanup, render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { platform } from '../../base-utils/platform/index';
import { NumberField } from '../index';

/**
 * Solid port of upstream's `NumberFieldScrubArea.test.tsx`. `describeConformance` is upstream's
 * shared React-only conformance harness with no Solid equivalent, so only behavioral tests carry
 * over. Upstream itself gates the pointer-scrubbing tests behind
 * `if (isJSDOM || isWebKit) { return; }` — real pointer-move deltas and the Pointer Lock API
 * aren't reliably simulated in jsdom. This repo's vitest config only runs in a jsdom environment
 * (no separate Chromium test target), so those tests are ported skipped via
 * `describe.skipIf(platform.env.jsdom)`, mirroring upstream's own `describe.skipIf(isJSDOM)` idiom
 * — they'd run automatically if this suite ever gained a real-browser target.
 */
const isJSDOM = platform.env.jsdom;

afterEach(cleanup);

let currentPos = { clientX: 0, clientY: 0 };

function createPointerDownEvent(elm: HTMLElement) {
  const box = elm.getBoundingClientRect();
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;
  currentPos = { clientX: centerX, clientY: centerY };
  return new PointerEvent('pointerdown', {
    bubbles: true,
    ...currentPos,
  });
}

function createPointerMoveEvent({
  movementX = 0,
  movementY = 0,
}: {
  movementX?: number;
  movementY?: number;
}) {
  currentPos = {
    clientX: currentPos.clientX + movementX,
    clientY: currentPos.clientY + movementY,
  };
  return new PointerEvent('pointermove', {
    bubbles: true,
    ...currentPos,
    movementX,
    movementY,
  } as PointerEventInit);
}

describe('<NumberField.ScrubArea />', () => {
  it('has presentation role', () => {
    render(() => (
      <NumberField.Root>
        <NumberField.ScrubArea />
      </NumberField.Root>
    ));
    expect(screen.queryByRole('presentation')).not.toBe(null);
  });

  it('should fire onClick when clicked without scrubbing', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(() => (
      <NumberField.Root defaultValue={0}>
        <NumberField.ScrubArea data-testid="scrub-area" onClick={handleClick}>
          <NumberField.ScrubAreaCursor />
        </NumberField.ScrubArea>
      </NumberField.Root>
    ));

    await user.click(screen.getByTestId('scrub-area'));

    expect(handleClick.mock.calls.length).toBe(1);
  });

  it('should fire onClick on child elements', async () => {
    const handleScrubAreaClick = vi.fn();
    const handleLabelClick = vi.fn();
    const user = userEvent.setup();

    render(() => (
      <NumberField.Root defaultValue={0}>
        <NumberField.ScrubArea onClick={handleScrubAreaClick}>
          <label onClick={handleLabelClick}>Amount</label>
          <NumberField.ScrubAreaCursor />
        </NumberField.ScrubArea>
      </NumberField.Root>
    ));

    await user.click(screen.getByText('Amount'));

    expect(handleLabelClick.mock.calls.length).toBe(1);
    expect(handleScrubAreaClick.mock.calls.length).toBe(1);
  });

  // Pointer-move deltas (`movementX`/`movementY`) and the Pointer Lock API aren't reliably
  // simulated in jsdom; upstream gates these identically behind `isJSDOM`.
  describe.skipIf(isJSDOM)('pointer scrubbing (requires a real browser)', () => {
    it('should increment or decrement the value when scrubbing with the pointer', () => {
      render(() => (
        <NumberField.Root defaultValue={0}>
          <NumberField.Input />
          <NumberField.ScrubArea data-testid="scrub-area">
            <NumberField.ScrubAreaCursor />
          </NumberField.ScrubArea>
        </NumberField.Root>
      ));

      const scrubArea = screen.getByTestId('scrub-area');
      const input = screen.getByRole('textbox');

      scrubArea.dispatchEvent(createPointerDownEvent(scrubArea));
      scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: -10 }));

      expect(input).toHaveValue('-10');

      scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: 5 }));

      expect(input).toHaveValue('-5');

      scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: -2 }));

      expect(input).toHaveValue('-7');
    });

    it('clears the root scrubbing state when the scrub area unmounts mid-scrub', () => {
      const [scrubAreaMounted, setScrubAreaMounted] = createSignal(true);

      render(() => (
        <NumberField.Root defaultValue={0} data-testid="root">
          <NumberField.Input />
          <Show when={scrubAreaMounted()}>
            <NumberField.ScrubArea data-testid="scrub-area">
              <NumberField.ScrubAreaCursor />
            </NumberField.ScrubArea>
          </Show>
        </NumberField.Root>
      ));

      const scrubArea = screen.getByTestId('scrub-area');
      const root = screen.getByTestId('root');

      scrubArea.dispatchEvent(createPointerDownEvent(scrubArea));
      scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: -10 }));

      expect(root).toHaveAttribute('data-scrubbing');

      // Unmount the scrub area before pointerup; the root must not stay stuck in the scrubbing
      // state.
      setScrubAreaMounted(false);

      expect(root).not.toHaveAttribute('data-scrubbing');
    });

    it('calls onValueChange while scrubbing and onValueCommitted on pointerup', () => {
      const onValueChange = vi.fn();
      const onValueCommitted = vi.fn();

      render(() => (
        <NumberField.Root
          defaultValue={0}
          onValueChange={onValueChange}
          onValueCommitted={onValueCommitted}
        >
          <NumberField.Input />
          <NumberField.ScrubArea data-testid="scrub-area">
            <NumberField.ScrubAreaCursor />
          </NumberField.ScrubArea>
        </NumberField.Root>
      ));

      const scrubArea = screen.getByTestId('scrub-area');

      scrubArea.dispatchEvent(createPointerDownEvent(scrubArea));
      scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: 3 }));

      expect(onValueChange.mock.calls.length).toBeGreaterThan(0);

      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

      expect(onValueCommitted.mock.calls.length).toBe(1);

      const lastChange = onValueChange.mock.lastCall?.[0];
      const committed = onValueCommitted.mock.calls[0][0];
      expect(committed).toBe(lastChange);
    });

    describe('prop: pixelSensitivity', () => {
      it('should only increment if the pointer movement was greater than or equal to the value', () => {
        render(() => (
          <NumberField.Root defaultValue={0}>
            <NumberField.Input />
            <NumberField.ScrubArea data-testid="scrub-area" pixelSensitivity={5}>
              <NumberField.ScrubAreaCursor />
            </NumberField.ScrubArea>
          </NumberField.Root>
        ));

        const scrubArea = screen.getByTestId('scrub-area');
        const input = screen.getByRole('textbox');

        scrubArea.dispatchEvent(createPointerDownEvent(scrubArea));
        scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: -2 }));

        expect(input).toHaveValue('0');

        scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: 2 }));

        expect(input).toHaveValue('0');

        scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: 1 }));
        scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: 1 }));
        scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: 1 }));
        scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: 1 }));

        expect(input).toHaveValue('0');

        scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: 1 }));

        expect(input).toHaveValue('1');

        scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: 5 }));

        expect(input).toHaveValue('6');

        scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: -4 }));

        expect(input).toHaveValue('6');

        scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: -1 }));

        expect(input).toHaveValue('5');

        scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: 5 }));

        expect(input).toHaveValue('10');
      });
    });

    describe('prop: direction', () => {
      it('should only scrub if the pointer moved in the given direction', () => {
        render(() => (
          <NumberField.Root defaultValue={0}>
            <NumberField.Input />
            <NumberField.ScrubArea data-testid="scrub-area" direction="horizontal">
              <NumberField.ScrubAreaCursor />
            </NumberField.ScrubArea>
          </NumberField.Root>
        ));

        const scrubArea = screen.getByTestId('scrub-area');
        const input = screen.getByRole('textbox');

        scrubArea.dispatchEvent(createPointerDownEvent(scrubArea));
        scrubArea.dispatchEvent(createPointerMoveEvent({ movementX: 10 }));

        expect(input).toHaveValue('10');

        scrubArea.dispatchEvent(createPointerMoveEvent({ movementY: 10 }));

        expect(input).toHaveValue('10');
      });
    });
  });
});
