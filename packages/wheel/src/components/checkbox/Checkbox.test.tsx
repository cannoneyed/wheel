// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { Checkbox } from './index';
import { Field } from '../field';
import { Form } from '../form';

describe('<Checkbox.Root />', () => {
  it('renders a span with role="checkbox" and a hidden checkbox input', () => {
    const { getByRole, container } = render(() => <Checkbox.Root />);
    const checkbox = getByRole('checkbox');
    expect(checkbox.tagName).toBe('SPAN');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    const input = container.querySelector('input[type="checkbox"]')!;
    expect(input).toHaveAttribute('aria-hidden', 'true');
    expect(input).toHaveAttribute('tabindex', '-1');
  });

  describe('ARIA attributes', () => {
    it('sets the correct aria attributes', () => {
      const [required, setRequired] = createSignal(false);
      const { getByTestId } = render(() => (
        <Checkbox.Root data-testid="test" required={required()} />
      ));
      const checkbox = getByTestId('test');
      expect(checkbox).toHaveAttribute('aria-checked');
      expect(checkbox).not.toHaveAttribute('aria-required');

      setRequired(true);
      expect(checkbox).toHaveAttribute('aria-required', 'true');
    });
  });

  describe('extra props', () => {
    it('can override the built-in attributes', () => {
      const { container } = render(() => <Checkbox.Root role="switch" />);
      expect(container.firstElementChild).toHaveAttribute('role', 'switch');
    });
  });

  describe('interactions', () => {
    it('should change its state when clicked', async () => {
      const user = userEvent.setup();
      const { getByRole, container } = render(() => <Checkbox.Root />);
      const checkbox = getByRole('checkbox');
      const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;

      expect(checkbox).toHaveAttribute('aria-checked', 'false');
      expect(input.checked).toBe(false);

      await user.click(checkbox);

      expect(checkbox).toHaveAttribute('aria-checked', 'true');
      expect(input.checked).toBe(true);

      await user.click(checkbox);

      expect(checkbox).toHaveAttribute('aria-checked', 'false');
      expect(input.checked).toBe(false);
    });

    it('should update its state when changed from outside (controlled)', () => {
      const [checked, setChecked] = createSignal(false);
      const { getByRole } = render(() => <Checkbox.Root checked={checked()} />);
      const checkbox = getByRole('checkbox');

      expect(checkbox).toHaveAttribute('aria-checked', 'false');
      setChecked(true);
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
      setChecked(false);
      expect(checkbox).toHaveAttribute('aria-checked', 'false');
    });

    it('should call onCheckedChange when clicked', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      const { getByRole } = render(() => <Checkbox.Root onCheckedChange={handleChange} />);

      await user.click(getByRole('checkbox'));

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange.mock.calls[0][0]).toBe(true);
      expect(handleChange.mock.calls[0][1].reason).toBe('none');
    });

    it('does not update its state when onCheckedChange cancels the event', async () => {
      const user = userEvent.setup();
      const { getByRole, container } = render(() => (
        <Checkbox.Root onCheckedChange={(_, details) => details.cancel()} />
      ));
      const checkbox = getByRole('checkbox');
      const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;

      await user.click(checkbox);

      expect(checkbox).toHaveAttribute('aria-checked', 'false');
      expect(input.checked).toBe(false);
    });

    it('should update its state if the underlying input is toggled', async () => {
      const user = userEvent.setup();
      const { getByRole, container } = render(() => <Checkbox.Root />);
      const checkbox = getByRole('checkbox');
      const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;

      await user.click(input);

      expect(checkbox).toHaveAttribute('aria-checked', 'true');
    });

    it('can be activated with the Space key', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <Checkbox.Root />);
      const checkbox = getByRole('checkbox');

      expect(checkbox).toHaveAttribute('aria-checked', 'false');

      await user.tab();
      expect(checkbox).toHaveFocus();

      await user.keyboard('[Space]');
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
    });

    it('does not activate with the Enter key', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <Checkbox.Root />);
      const checkbox = getByRole('checkbox');

      await user.tab();
      expect(checkbox).toHaveFocus();

      await user.keyboard('[Enter]');
      expect(checkbox).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('prop: disabled', () => {
    it('uses aria-disabled instead of HTML disabled', () => {
      const { getByRole } = render(() => <Checkbox.Root disabled />);
      expect(getByRole('checkbox')).not.toHaveAttribute('disabled');
      expect(getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
    });

    it('should not change its state when clicked', () => {
      const { getByRole } = render(() => <Checkbox.Root disabled />);
      const checkbox = getByRole('checkbox');

      expect(checkbox).toHaveAttribute('aria-checked', 'false');
      checkbox.click();
      expect(checkbox).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('prop: readOnly', () => {
    it('has the aria-readonly attribute', () => {
      const { getByRole } = render(() => <Checkbox.Root readOnly />);
      expect(getByRole('checkbox')).toHaveAttribute('aria-readonly', 'true');
    });

    it('does not have the attribute when not set', () => {
      const { getByRole } = render(() => <Checkbox.Root />);
      expect(getByRole('checkbox')).not.toHaveAttribute('aria-readonly');
    });

    it('should not change its state when clicked', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <Checkbox.Root readOnly />);
      const checkbox = getByRole('checkbox');

      expect(checkbox).toHaveAttribute('aria-checked', 'false');
      await user.click(checkbox);
      expect(checkbox).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('prop: indeterminate', () => {
    it('sets aria-checked to "mixed"', () => {
      const { getByRole } = render(() => <Checkbox.Root indeterminate />);
      expect(getByRole('checkbox')).toHaveAttribute('aria-checked', 'mixed');
    });

    it('should not change its state when clicked', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <Checkbox.Root indeterminate />);
      const checkbox = getByRole('checkbox');

      expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
      await user.click(checkbox);
      expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
    });

    it('is not overridden by the checked prop', () => {
      const { getByRole } = render(() => <Checkbox.Root indeterminate checked />);
      expect(getByRole('checkbox')).toHaveAttribute('aria-checked', 'mixed');
    });

    it('sets the native input indeterminate property', () => {
      const { container } = render(() => <Checkbox.Root indeterminate />);
      const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(input.indeterminate).toBe(true);
    });

    it('sets data-indeterminate on the root and suppresses data-checked/unchecked', () => {
      const { getByRole } = render(() => <Checkbox.Root indeterminate />);
      const checkbox = getByRole('checkbox');
      expect(checkbox).toHaveAttribute('data-indeterminate', '');
      expect(checkbox).not.toHaveAttribute('data-checked');
      expect(checkbox).not.toHaveAttribute('data-unchecked');
    });
  });

  describe('style hooks', () => {
    it('exposes the resolved size and validation status', () => {
      const { getByRole } = render(() => <Checkbox.Root size="sm" status="warning" />);
      expect(getByRole('checkbox')).toHaveAttribute('data-size', 'sm');
      expect(getByRole('checkbox')).toHaveAttribute('data-status', 'warning');
    });

    it('places data-checked/unchecked/disabled/readonly/required on the root', async () => {
      const user = userEvent.setup();
      const [disabled, setDisabled] = createSignal(true);
      const [readOnly, setReadOnly] = createSignal(true);
      const { getByRole } = render(() => (
        <Checkbox.Root defaultChecked disabled={disabled()} readOnly={readOnly()} required />
      ));
      const checkbox = getByRole('checkbox');

      expect(checkbox).toHaveAttribute('data-checked', '');
      expect(checkbox).not.toHaveAttribute('data-unchecked');
      expect(checkbox).toHaveAttribute('data-disabled', '');
      expect(checkbox).toHaveAttribute('data-readonly', '');
      expect(checkbox).toHaveAttribute('data-required', '');

      setDisabled(false);
      setReadOnly(false);
      await user.click(getByRole('checkbox'));

      expect(getByRole('checkbox')).toHaveAttribute('data-unchecked', '');
      expect(getByRole('checkbox')).not.toHaveAttribute('data-checked');
    });
  });

  describe('form integration', () => {
    it('sets the name attribute only on the input', () => {
      const { getByRole, container } = render(() => <Checkbox.Root name="checkbox-name" />);
      const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(input).toHaveAttribute('name', 'checkbox-name');
      expect(getByRole('checkbox')).not.toHaveAttribute('name');
    });

    it('renders a hidden input with uncheckedValue when off', () => {
      const { container } = render(() => <Checkbox.Root name="opt" uncheckedValue="no" />);
      const hidden = container.querySelector('input[type="hidden"]') as HTMLInputElement;
      expect(hidden).not.toBeNull();
      expect(hidden.value).toBe('no');
      expect(hidden).toHaveAttribute('name', 'opt');
    });

    it('removes the uncheckedValue input when on', async () => {
      const user = userEvent.setup();
      const { container, getByRole } = render(() => (
        <Checkbox.Root name="opt" uncheckedValue="no" />
      ));
      await user.click(getByRole('checkbox'));
      expect(container.querySelector('input[type="hidden"]')).toBeNull();
    });
  });

  describe('with native <label>', () => {
    it('toggles the checkbox when a wrapping <label> is clicked', () => {
      const { getByRole, getByTestId } = render(() => (
        <label data-testid="label">
          <Checkbox.Root />
          Toggle
        </label>
      ));
      const checkbox = getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-checked', 'false');

      getByTestId('label').click();
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
    });
  });

  describe('Enter-key form submission', () => {
    it('submits the owning form when Enter is pressed, matching native checkbox behavior', async () => {
      const user = userEvent.setup();
      const submitSpy = vi.fn((event: SubmitEvent) => {
        event.preventDefault();
      });

      const { getByRole } = render(() => (
        <Form onSubmit={submitSpy}>
          <Checkbox.Root name="accept" />
          <button type="submit">Submit</button>
        </Form>
      ));

      const checkbox = getByRole('checkbox');
      checkbox.focus();
      expect(checkbox).toHaveFocus();

      await user.keyboard('[Enter]');

      await vi.waitFor(() => {
        expect(submitSpy).toHaveBeenCalledTimes(1);
      });
      // Enter must not toggle the checkbox itself, only submit the form.
      expect(checkbox).toHaveAttribute('aria-checked', 'false');
    });

    it('does not submit the form when the consumer prevents default on keydown', async () => {
      const user = userEvent.setup();
      const submitSpy = vi.fn((event: SubmitEvent) => {
        event.preventDefault();
      });

      const { getByRole } = render(() => (
        <Form onSubmit={submitSpy}>
          <Checkbox.Root name="accept" onKeyDown={(event) => event.preventDefault()} />
          <button type="submit">Submit</button>
        </Form>
      ));

      const checkbox = getByRole('checkbox');
      checkbox.focus();

      await user.keyboard('[Enter]');

      expect(submitSpy).not.toHaveBeenCalled();
    });
  });

  it('supports class as a function of state', async () => {
    const user = userEvent.setup();
    const { getByRole } = render(() => (
      <Checkbox.Root class={(state) => (state.checked ? 'on' : 'off')} />
    ));
    const checkbox = getByRole('checkbox');
    expect(checkbox).toHaveClass('off');
    await user.click(checkbox);
    expect(checkbox).toHaveClass('on');
  });

  describe('inside <Field.Root />', () => {
    it('associates Field.Label with the checkbox and toggles it on label click', async () => {
      const user = userEvent.setup();
      const { getByRole, getByText } = render(() => (
        <Field.Root>
          <Field.Label>Accept terms</Field.Label>
          <Checkbox.Root />
        </Field.Root>
      ));

      const checkbox = getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-checked', 'false');

      await user.click(getByText('Accept terms'));

      expect(checkbox).toHaveAttribute('aria-checked', 'true');
    });

    it('shows Field.Error once the required checkbox is validated and left unchecked', async () => {
      const user = userEvent.setup();
      const { getByRole, queryByTestId } = render(() => (
        <Field.Root validationMode="onBlur">
          <Checkbox.Root required />
          <Field.Error data-testid="error" />
        </Field.Root>
      ));

      const checkbox = getByRole('checkbox');
      await user.click(checkbox);
      await user.click(checkbox);
      await user.click(document.body);

      expect(queryByTestId('error')).not.toBe(null);
    });

    it('propagates disabled from Field.Root to the checkbox', () => {
      const { container } = render(() => (
        <Field.Root disabled>
          <Checkbox.Root />
        </Field.Root>
      ));

      expect(container.querySelector('span[role="checkbox"]')).toHaveAttribute(
        'data-disabled',
        '',
      );
    });
  });
});

describe('<Checkbox.Indicator />', () => {
  it('does not render by default', () => {
    const { queryByTestId } = render(() => (
      <Checkbox.Root>
        <Checkbox.Indicator data-testid="indicator" />
      </Checkbox.Root>
    ));
    expect(queryByTestId('indicator')).toBe(null);
  });

  it('renders when checked', () => {
    const { getByTestId } = render(() => (
      <Checkbox.Root checked>
        <Checkbox.Indicator data-testid="indicator" />
      </Checkbox.Root>
    ));
    expect(getByTestId('indicator')).not.toBe(null);
  });

  it('renders when indeterminate', () => {
    const { getByTestId } = render(() => (
      <Checkbox.Root indeterminate>
        <Checkbox.Indicator data-testid="indicator" />
      </Checkbox.Root>
    ));
    expect(getByTestId('indicator')).not.toBe(null);
  });

  it('spreads extra props', () => {
    const { getByTestId } = render(() => (
      <Checkbox.Root defaultChecked>
        <Checkbox.Indicator data-testid="indicator" data-extra-prop="Lorem ipsum" />
      </Checkbox.Root>
    ));
    expect(getByTestId('indicator')).toHaveAttribute('data-extra-prop', 'Lorem ipsum');
  });

  it('inherits state data attributes from the root', async () => {
    const user = userEvent.setup();
    const { getByRole, getByTestId } = render(() => (
      <Checkbox.Root>
        <Checkbox.Indicator data-testid="indicator" keepMounted />
      </Checkbox.Root>
    ));
    const indicator = getByTestId('indicator');
    expect(indicator).toHaveAttribute('data-unchecked', '');
    await user.click(getByRole('checkbox'));
    expect(indicator).toHaveAttribute('data-checked', '');
  });

  describe('prop: keepMounted', () => {
    it('keeps the indicator mounted when unchecked', () => {
      const { getByTestId } = render(() => (
        <Checkbox.Root>
          <Checkbox.Indicator data-testid="indicator" keepMounted />
        </Checkbox.Root>
      ));
      expect(getByTestId('indicator')).not.toBe(null);
    });

    it('keeps the indicator mounted when checked', () => {
      const { getByTestId } = render(() => (
        <Checkbox.Root checked>
          <Checkbox.Indicator data-testid="indicator" keepMounted />
        </Checkbox.Root>
      ));
      expect(getByTestId('indicator')).not.toBe(null);
    });

    it('keeps the indicator mounted when indeterminate', () => {
      const { getByTestId } = render(() => (
        <Checkbox.Root indeterminate>
          <Checkbox.Indicator data-testid="indicator" keepMounted />
        </Checkbox.Root>
      ));
      expect(getByTestId('indicator')).not.toBe(null);
    });
  });

  // Upstream also verifies the indicator is removed after the CSS
  // enter/exit-animation or transition completes (`data-starting-style`
  // /`data-ending-style` + `waitFor`). Those tests require real layout/CSS
  // animation timing and are marked `skipIf(isJSDOM)` upstream (Chromium
  // only); this project's test suite runs under jsdom only, so they are not
  // ported. `createTransitionStatus`/`createOpenChangeComplete` are exercised
  // directly in `internals/createTransitionStatus.test.ts`.
});
