// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { OTPField } from '../index';
import { Field } from '../../field';
import { DirectionProvider } from '../../direction-provider';

// Ported from upstream `OTPFieldInput.test.tsx`. Solid renders synchronously (no `act()` needed
// around `.focus()`); `fireEvent.change` becomes `fireEvent.input` (Solid's controls bind the
// per-keystroke `input` DOM event, matching `packages/solid/src/field/control/FieldControl.tsx`'s
// convention — see the longer note in `../root/OTPFieldRoot.test.tsx`).
//
// Skipped (not ported): `describeConformance` (React-only test harness) and the "throws when
// rendered outside <OTPField.Root>" test — Solid throws the same descriptive error, but
// `@solidjs/testing-library`'s `render` does not reject the way upstream's `render(...)` does;
// asserting it would just be testing `useOTPFieldRootContext`'s own error message again.

afterEach(cleanup);

describe('<OTPField.Input />', () => {
  const OTP_LENGTH = 6;
  const modifierKeys = [
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
  ] as const;

  function OTPFieldTest(props: Record<string, any> = {}) {
    return (
      <OTPField.Root length={OTP_LENGTH} {...props}>
        {Array.from({ length: OTP_LENGTH }, () => (
          <OTPField.Input />
        ))}
      </OTPField.Root>
    );
  }

  function pasteText(target: HTMLElement, value: string) {
    fireEvent.paste(target, {
      clipboardData: {
        getData: () => value,
      },
    });
  }

  function pasteWithError(target: HTMLElement, error: Error) {
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        getData() {
          throw error;
        },
      },
    });

    fireEvent(target, pasteEvent);
  }

  it('renders one textbox per slot', () => {
    render(() => <OTPFieldTest />);

    expect(screen.getAllByRole('textbox')).toHaveLength(6);
  });

  it('moves focus with arrow keys', () => {
    render(() => <OTPFieldTest defaultValue="12" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[1].focus();

    fireEvent.keyDown(inputs[1], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(inputs[2]);

    fireEvent.keyDown(inputs[2], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(inputs[1]);
  });

  it('moves focus with arrow keys in RTL', () => {
    render(() => (
      <DirectionProvider direction="rtl">
        <OTPFieldTest defaultValue="12" />
      </DirectionProvider>
    ));

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[1].focus();

    fireEvent.keyDown(inputs[1], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(inputs[2]);

    fireEvent.keyDown(inputs[2], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(inputs[1]);
  });

  it('redirects focus to the first empty slot when a later empty slot is focused', () => {
    render(() => <OTPFieldTest defaultValue="12" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[4].focus();

    expect(document.activeElement).toBe(inputs[2]);
  });

  it('moves focus to the next slot after typing', () => {
    render(() => <OTPFieldTest />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[0].focus();
    fireEvent.input(inputs[0], { target: { value: '1' } });

    expect(document.activeElement).toBe(inputs[1]);
  });

  it('selects the last slot after typing into it for the first time', () => {
    render(() => <OTPFieldTest defaultValue="12345" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');
    const lastInput = inputs[5];

    lastInput.focus();
    fireEvent.input(lastInput, { target: { value: '6' } });

    expect(document.activeElement).toBe(lastInput);
    expect(lastInput.selectionStart).toBe(0);
    expect(lastInput.selectionEnd).toBe(1);
  });

  it('keeps focus in place when typing is canceled', () => {
    render(() => (
      <OTPFieldTest
        onValueChange={(_: string, eventDetails: any) => {
          eventDetails.cancel();
        }}
      />
    ));

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[0].focus();
    fireEvent.input(inputs[0], { target: { value: '1' } });

    expect(inputs.map((input) => input.value)).toEqual(['', '', '', '', '', '']);
    expect(document.activeElement).toBe(inputs[0]);
  });

  it('keeps the filled slot selected when typing an invalid character', () => {
    render(() => <OTPFieldTest defaultValue="1" />);

    const [firstInput] = screen.getAllByRole<HTMLInputElement>('textbox');

    firstInput.focus();
    fireEvent.input(firstInput, { target: { value: 'a' } });

    expect(firstInput).toHaveValue('1');
    expect(document.activeElement).toBe(firstInput);
    expect(firstInput.selectionStart).toBe(0);
    expect(firstInput.selectionEnd).toBe(1);
  });

  it('selects the slot value on mousedown', () => {
    render(() => <OTPFieldTest defaultValue="1" />);

    const [firstInput] = screen.getAllByRole<HTMLInputElement>('textbox');

    fireEvent.mouseDown(firstInput);

    expect(firstInput.selectionStart).toBe(0);
    expect(firstInput.selectionEnd).toBe(1);
  });

  it('moves focus to the next slot when typing the same character into a filled slot', async () => {
    const user = userEvent.setup();

    render(() => <OTPFieldTest defaultValue="12" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[1].focus();

    await user.keyboard('2');

    expect(document.activeElement).toBe(inputs[2]);
  });

  it.each([
    ['ArrowUp', 0],
    ['ArrowDown', 4],
  ] as const)('moves focus to the field boundary with %s', (key, targetIndex) => {
    render(() => <OTPFieldTest defaultValue="1234" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[1].focus();

    expect(fireEvent.keyDown(inputs[1], { key })).toBe(false);
    expect(inputs[targetIndex]).toHaveFocus();
  });

  it('stops propagation when ArrowDown moves focus to the empty end slot', () => {
    const onKeyDown = vi.fn();

    render(() => (
      <div onKeyDown={onKeyDown}>
        <OTPFieldTest defaultValue="1234" />
      </div>
    ));

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[1].focus();

    expect(fireEvent.keyDown(inputs[1], { key: 'ArrowDown' })).toBe(false);
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(inputs[4]).toHaveFocus();
  });

  it('keeps focus on the empty end slot with ArrowDown', () => {
    render(() => <OTPFieldTest defaultValue="12" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[2].focus();

    expect(fireEvent.keyDown(inputs[2], { key: 'ArrowDown' })).toBe(false);
    expect(inputs[2]).toHaveFocus();
  });

  it('keeps focus on the final slot with ArrowDown when the value is complete', () => {
    render(() => <OTPFieldTest defaultValue="123456" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[5].focus();

    expect(fireEvent.keyDown(inputs[5], { key: 'ArrowDown' })).toBe(false);
    expect(inputs[5]).toHaveFocus();
  });

  it('does not reselect the final slot when typing the same character', async () => {
    const user = userEvent.setup();

    render(() => <OTPFieldTest defaultValue="123456" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');
    const lastInput = inputs[5];

    lastInput.focus();

    const select = vi.spyOn(lastInput, 'select');

    try {
      await user.keyboard('6');

      expect(select).not.toHaveBeenCalled();
      expect(lastInput).toHaveFocus();
    } finally {
      select.mockRestore();
    }
  });

  it('moves focus to the first slot with Home', () => {
    render(() => <OTPFieldTest defaultValue="1234" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[3].focus();
    fireEvent.keyDown(inputs[3], { key: 'Home' });

    expect(document.activeElement).toBe(inputs[0]);
  });

  it('moves focus to the empty end slot with End', () => {
    render(() => <OTPFieldTest defaultValue="1234" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[0].focus();
    fireEvent.keyDown(inputs[0], { key: 'End' });

    expect(document.activeElement).toBe(inputs[4]);
  });

  it.each(modifierKeys)(
    'moves focus to the field boundaries with %s + arrow keys',
    (_, modifierKey) => {
      render(() => <OTPFieldTest defaultValue="1234" />);

      const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

      inputs[2].focus();

      fireEvent.keyDown(inputs[2], { key: 'ArrowLeft', ...modifierKey });
      expect(document.activeElement).toBe(inputs[0]);

      fireEvent.keyDown(inputs[0], { key: 'ArrowRight', ...modifierKey });
      expect(document.activeElement).toBe(inputs[4]);
    },
  );

  it.each(modifierKeys)(
    'moves focus to the field boundaries with %s + arrow keys in RTL',
    (_, modifierKey) => {
      render(() => (
        <DirectionProvider direction="rtl">
          <OTPFieldTest defaultValue="1234" />
        </DirectionProvider>
      ));

      const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

      inputs[2].focus();

      fireEvent.keyDown(inputs[2], { key: 'ArrowLeft', ...modifierKey });
      expect(document.activeElement).toBe(inputs[4]);

      fireEvent.keyDown(inputs[4], { key: 'ArrowRight', ...modifierKey });
      expect(document.activeElement).toBe(inputs[0]);
    },
  );

  it('keeps arrow and home/end navigation working in readonly mode', () => {
    render(() => <OTPFieldTest defaultValue="1234" readOnly />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[1].focus();

    fireEvent.keyDown(inputs[1], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(inputs[2]);

    fireEvent.keyDown(inputs[2], { key: 'Home' });
    expect(document.activeElement).toBe(inputs[0]);

    fireEvent.keyDown(inputs[0], { key: 'End' });
    expect(document.activeElement).toBe(inputs[4]);

    fireEvent.keyDown(inputs[4], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(inputs[0]);

    fireEvent.keyDown(inputs[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(inputs[4]);
  });

  it('leaves vertical arrow navigation unhandled in disabled mode', () => {
    const onKeyDown = vi.fn();

    render(() => (
      <div onKeyDown={onKeyDown}>
        <OTPFieldTest defaultValue="12" disabled />
      </div>
    ));

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    const arrowUpEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowUp',
    });
    const arrowDownEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown',
    });

    expect(inputs[1].dispatchEvent(arrowUpEvent)).toBe(true);
    expect(inputs[1].dispatchEvent(arrowDownEvent)).toBe(true);
    expect(onKeyDown).toHaveBeenCalledTimes(2);
  });

  it('blocks Delete and Backspace from changing the value in readonly mode', () => {
    render(() => <OTPFieldTest defaultValue="1234" readOnly />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[1].focus();

    fireEvent.keyDown(inputs[1], { key: 'Delete' });
    expect(inputs.map((input) => input.value)).toEqual(['1', '2', '3', '4', '', '']);
    expect(document.activeElement).toBe(inputs[1]);

    fireEvent.keyDown(inputs[1], { key: 'Backspace' });
    expect(inputs.map((input) => input.value)).toEqual(['1', '2', '3', '4', '', '']);
    expect(document.activeElement).toBe(inputs[1]);
  });

  it('blocks paste from changing the value in readonly mode', () => {
    render(() => <OTPFieldTest defaultValue="1234" readOnly />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[1].focus();
    pasteText(inputs[1], '99');

    expect(inputs.map((input) => input.value)).toEqual(['1', '2', '3', '4', '', '']);
    expect(document.activeElement).toBe(inputs[1]);
  });

  it('warns in development when clipboard text cannot be read during paste handling', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      render(() => <OTPFieldTest defaultValue="12" />);

      const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

      inputs[1].focus();
      pasteWithError(inputs[1], new DOMException('Blocked', 'SecurityError'));

      expect(inputs.map((input) => input.value)).toEqual(['1', '2', '', '', '', '']);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain(
        '<OTPField.Input> could not read clipboard text during paste handling.',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('allows tabbing out of the field from the active slot', async () => {
    const user = userEvent.setup();

    render(() => (
      <>
        <OTPFieldTest />
        <button type="button">Next</button>
      </>
    ));

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[0].focus();
    fireEvent.input(inputs[0], { target: { value: '1' } });
    expect(document.activeElement).toBe(inputs[1]);

    await user.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
  });

  it('deletes the current character and moves focus to the previous slot on backspace', () => {
    render(() => <OTPFieldTest defaultValue="1234" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[1].focus();
    fireEvent.keyDown(inputs[1], { key: 'Backspace' });

    expect(inputs.map((input) => input.value)).toEqual(['1', '3', '4', '', '', '']);
    expect(document.activeElement).toBe(inputs[0]);
  });

  it('deletes the previous filled slot when backspacing on an empty non-first slot', () => {
    render(() => <OTPFieldTest defaultValue="12" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[2].focus();
    fireEvent.keyDown(inputs[2], { key: 'Backspace' });

    expect(inputs.map((input) => input.value)).toEqual(['1', '', '', '', '', '']);
    expect(document.activeElement).toBe(inputs[1]);
  });

  it.each(modifierKeys)('clears all slots with %s + Backspace', (_, modifierKey) => {
    render(() => <OTPFieldTest defaultValue="1234" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[2].focus();
    fireEvent.keyDown(inputs[2], { key: 'Backspace', ...modifierKey });

    expect(inputs.map((input) => input.value)).toEqual(['', '', '', '', '', '']);
    expect(document.activeElement).toBe(inputs[0]);
  });

  it('keeps focus in place when backspace is canceled', () => {
    render(() => (
      <OTPFieldTest
        defaultValue="1234"
        onValueChange={(_: string, eventDetails: any) => {
          eventDetails.cancel();
        }}
      />
    ));

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[1].focus();
    fireEvent.keyDown(inputs[1], { key: 'Backspace' });

    expect(inputs.map((input) => input.value)).toEqual(['1', '2', '3', '4', '', '']);
    expect(document.activeElement).toBe(inputs[1]);
  });

  it('deletes the current character with Delete without moving focus', () => {
    render(() => <OTPFieldTest defaultValue="1234" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[1].focus();
    fireEvent.keyDown(inputs[1], { key: 'Delete' });

    expect(inputs.map((input) => input.value)).toEqual(['1', '3', '4', '', '', '']);
    expect(document.activeElement).toBe(inputs[1]);
    expect(inputs[1].selectionStart).toBe(0);
    expect(inputs[1].selectionEnd).toBe(1);
  });

  it('selects the previous slot value after backspacing into the first slot', () => {
    render(() => <OTPFieldTest defaultValue="12" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[1].focus();
    fireEvent.keyDown(inputs[1], { key: 'Backspace' });

    expect(document.activeElement).toBe(inputs[0]);
    expect(inputs[0].selectionStart).toBe(0);
    expect(inputs[0].selectionEnd).toBe(1);
  });

  it('keeps focus in place when paste is canceled', () => {
    render(() => (
      <OTPFieldTest
        onValueChange={(_: string, eventDetails: any) => {
          eventDetails.cancel();
        }}
      />
    ));

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[0].focus();
    pasteText(inputs[0], '1234');

    expect(inputs.map((input) => input.value)).toEqual(['', '', '', '', '', '']);
    expect(document.activeElement).toBe(inputs[0]);
  });

  it('replaces values from the middle when pasting into a later slot', () => {
    render(() => <OTPFieldTest defaultValue="123456" />);

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs[2].focus();
    pasteText(inputs[2], '99');

    expect(inputs.map((input) => input.value)).toEqual(['1', '2', '9', '9', '5', '6']);
    expect(document.activeElement).toBe(inputs[4]);
  });

  it('marks each input as complete when all slots are filled', () => {
    render(() => <OTPFieldTest defaultValue="123456" />);

    screen.getAllByRole<HTMLInputElement>('textbox').forEach((input) => {
      expect(input).toHaveAttribute('data-complete', '');
    });
  });

  it('adds disabled and readonly state attributes to each slot', () => {
    const { unmount } = render(() => <OTPFieldTest disabled />);

    screen.getAllByRole<HTMLInputElement>('textbox').forEach((input) => {
      expect(input).toHaveAttribute('data-disabled', '');
    });

    unmount();

    render(() => <OTPFieldTest readOnly />);

    screen.getAllByRole<HTMLInputElement>('textbox').forEach((input) => {
      expect(input).toHaveAttribute('data-readonly', '');
    });
  });

  it('applies the Field label to every slot', () => {
    render(() => (
      <Field.Root>
        <Field.Label data-testid="label">Verification code</Field.Label>
        <Field.Description data-testid="description">Enter the code.</Field.Description>
        <OTPFieldTest />
      </Field.Root>
    ));

    const label = screen.getByTestId('label');
    const description = screen.getByTestId('description');
    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs.forEach((input) => {
      expect(input).toHaveAttribute('aria-labelledby', label.id);
      expect(input).not.toHaveAttribute('aria-describedby', description.id);
    });
  });

  it('applies a native label to every slot', () => {
    render(() => (
      <>
        <label for="verification-code">Verification code</label>
        <OTPField.Root id="verification-code" length={OTP_LENGTH}>
          <OTPField.Input />
          <OTPField.Input />
          <OTPField.Input />
          <OTPField.Input />
          <OTPField.Input />
          <OTPField.Input />
        </OTPField.Root>
      </>
    ));

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    inputs.forEach((input) => {
      expect(input).toHaveAccessibleName('Verification code');
    });
  });

  it('keeps the shared label on the first slot even if an aria-label is provided', () => {
    render(() => (
      <>
        <label for="verification-code">Verification code</label>
        <OTPField.Root id="verification-code" length={OTP_LENGTH}>
          <OTPField.Input aria-label="Character 1 of 6" />
          <OTPField.Input aria-label="Character 2 of 6" />
          <OTPField.Input />
          <OTPField.Input />
          <OTPField.Input />
          <OTPField.Input />
        </OTPField.Root>
      </>
    ));

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');

    expect(inputs[0]).toHaveAccessibleName('Verification code');
    expect(inputs[0]).not.toHaveAttribute('aria-label', 'Character 1 of 6');
    expect(inputs[1]).toHaveAttribute('aria-label', 'Character 2 of 6');
  });

  it('warns when aria-label is provided on the first slot without an associated label', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      render(() => (
        <OTPField.Root length={OTP_LENGTH}>
          <OTPField.Input aria-label="Character 1 of 6" />
          <OTPField.Input />
          <OTPField.Input />
          <OTPField.Input />
          <OTPField.Input />
          <OTPField.Input />
        </OTPField.Root>
      ));

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain(
        '<OTPField.Input> ignores `aria-label` on the first input.',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not warn for a first-slot aria-label when a native label is associated', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      render(() => (
        <>
          <label for="native-label-verification-code">Verification code</label>
          <OTPField.Root id="native-label-verification-code" length={OTP_LENGTH}>
            <OTPField.Input aria-label="Character 1 of 6" />
            <OTPField.Input />
            <OTPField.Input />
            <OTPField.Input />
            <OTPField.Input />
            <OTPField.Input />
          </OTPField.Root>
        </>
      ));

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not warn for a first-slot aria-label when Field.Label is associated', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      render(() => (
        <Field.Root>
          <Field.Label>Verification code</Field.Label>
          <OTPField.Root length={OTP_LENGTH}>
            <OTPField.Input aria-label="Character 1 of 6" />
            <OTPField.Input />
            <OTPField.Input />
            <OTPField.Input />
            <OTPField.Input />
            <OTPField.Input />
          </OTPField.Root>
        </Field.Root>
      ));

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
