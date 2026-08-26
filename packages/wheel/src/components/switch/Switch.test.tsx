// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { Switch } from './index';
import { Field } from '../field';

describe('<Switch.Root />', () => {
  it('renders a span with role="switch" and a hidden checkbox input', () => {
    const { getByRole, container } = render(() => <Switch.Root />);
    const switchEl = getByRole('switch');
    expect(switchEl.tagName).toBe('SPAN');
    expect(switchEl).toHaveAttribute('aria-checked', 'false');
    const input = container.querySelector('input[type="checkbox"]')!;
    expect(input).toHaveAttribute('aria-hidden', 'true');
    expect(input).toHaveAttribute('tabindex', '-1');
  });

  it('shares size and status state with Root and Thumb', () => {
    const { getByRole, getByTestId } = render(() => (
      <Switch.Root size="sm" status="success">
        <Switch.Thumb data-testid="thumb" />
      </Switch.Root>
    ));

    expect(getByRole('switch')).toHaveAttribute('data-size', 'sm');
    expect(getByRole('switch')).toHaveAttribute('data-status', 'success');
    expect(getByTestId('thumb')).toHaveAttribute('data-size', 'sm');
    expect(getByTestId('thumb')).toHaveAttribute('data-status', 'success');
  });

  describe('interaction', () => {
    it('toggles on click (uncontrolled)', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <Switch.Root defaultChecked={false} />);
      const switchEl = getByRole('switch');

      expect(switchEl).toHaveAttribute('data-unchecked', '');
      await user.click(switchEl);
      expect(switchEl).toHaveAttribute('aria-checked', 'true');
      expect(switchEl).toHaveAttribute('data-checked', '');
      await user.click(switchEl);
      expect(switchEl).toHaveAttribute('aria-checked', 'false');
      expect(switchEl).toHaveAttribute('data-unchecked', '');
    });

    it('does not toggle when readOnly', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <Switch.Root readOnly />);
      const switchEl = getByRole('switch');
      expect(switchEl).toHaveAttribute('aria-readonly', 'true');
      await user.click(switchEl);
      expect(switchEl).toHaveAttribute('aria-checked', 'false');
    });

    it('does not toggle when disabled', async () => {
      const { getByRole } = render(() => <Switch.Root disabled />);
      const switchEl = getByRole('switch', { hidden: true });
      expect(switchEl).toHaveAttribute('data-disabled', '');
      switchEl.click();
      expect(switchEl).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('controlled', () => {
    it('follows the checked prop', () => {
      const [checked, setChecked] = createSignal(false);
      const { getByRole } = render(() => <Switch.Root checked={checked()} />);
      const switchEl = getByRole('switch');
      expect(switchEl).toHaveAttribute('aria-checked', 'false');
      setChecked(true);
      expect(switchEl).toHaveAttribute('aria-checked', 'true');
    });

    it('does not change on click without external update', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <Switch.Root checked={false} />);
      const switchEl = getByRole('switch');
      await user.click(switchEl);
      expect(switchEl).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('prop: onCheckedChange', () => {
    it('fires with next checked and details on click', async () => {
      const user = userEvent.setup();
      const onCheckedChange = vi.fn();
      const { getByRole } = render(() => <Switch.Root onCheckedChange={onCheckedChange} />);
      await user.click(getByRole('switch'));
      expect(onCheckedChange).toHaveBeenCalledTimes(1);
      expect(onCheckedChange.mock.calls[0][0]).toBe(true);
      expect(onCheckedChange.mock.calls[0][1].reason).toBe('none');
    });

    it('cancel() prevents the state change and resyncs the input', async () => {
      const user = userEvent.setup();
      const { getByRole, container } = render(() => (
        <Switch.Root onCheckedChange={(_, details) => details.cancel()} />
      ));
      const switchEl = getByRole('switch');
      await user.click(switchEl);
      expect(switchEl).toHaveAttribute('aria-checked', 'false');
      const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(input.checked).toBe(false);
    });
  });

  describe('form integration', () => {
    it('names the hidden input for form submission', () => {
      const { container } = render(() => <Switch.Root name="notifications" defaultChecked />);
      const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(input).toHaveAttribute('name', 'notifications');
      expect(input.checked).toBe(true);
    });

    it('renders a hidden input with uncheckedValue when off', () => {
      const { container } = render(() => (
        <Switch.Root name="opt" uncheckedValue="no" />
      ));
      const hidden = container.querySelector('input[type="hidden"]') as HTMLInputElement;
      expect(hidden).not.toBeNull();
      expect(hidden.value).toBe('no');
      expect(hidden).toHaveAttribute('name', 'opt');
    });

    it('removes the uncheckedValue input when on', async () => {
      const user = userEvent.setup();
      const { container, getByRole } = render(() => (
        <Switch.Root name="opt" uncheckedValue="no" />
      ));
      await user.click(getByRole('switch'));
      expect(container.querySelector('input[type="hidden"]')).toBeNull();
    });
  });

  describe('<Switch.Thumb />', () => {
    it('inherits state data attributes from the root', async () => {
      const user = userEvent.setup();
      const { getByRole, getByTestId } = render(() => (
        <Switch.Root>
          <Switch.Thumb data-testid="thumb" />
        </Switch.Root>
      ));
      const thumb = getByTestId('thumb');
      expect(thumb).toHaveAttribute('data-unchecked', '');
      await user.click(getByRole('switch'));
      expect(thumb).toHaveAttribute('data-checked', '');
    });
  });

  it('supports class as a function of state', async () => {
    const user = userEvent.setup();
    const { getByRole } = render(() => (
      <Switch.Root class={(state) => (state.checked ? 'on' : 'off')} />
    ));
    const switchEl = getByRole('switch');
    expect(switchEl).toHaveClass('off');
    await user.click(switchEl);
    expect(switchEl).toHaveClass('on');
  });

  describe('inside <Field.Root />', () => {
    it('associates Field.Label with the switch and toggles it on label click', async () => {
      const user = userEvent.setup();
      const { getByRole, getByText } = render(() => (
        <Field.Root>
          <Field.Label>Airplane mode</Field.Label>
          <Switch.Root />
        </Field.Root>
      ));

      const switchEl = getByRole('switch');
      expect(switchEl).toHaveAttribute('aria-checked', 'false');

      await user.click(getByText('Airplane mode'));

      expect(switchEl).toHaveAttribute('aria-checked', 'true');
    });

    it('applies data-touched and data-dirty to the switch after interaction', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => (
        <Field.Root>
          <Switch.Root />
        </Field.Root>
      ));

      const switchEl = getByRole('switch');
      expect(switchEl).not.toHaveAttribute('data-touched');

      await user.click(switchEl);
      expect(switchEl).toHaveAttribute('data-dirty', '');

      await user.click(document.body);
      expect(switchEl).toHaveAttribute('data-touched', '');
    });

    it('propagates disabled from Field.Root to the switch', () => {
      const { getByRole } = render(() => (
        <Field.Root disabled>
          <Switch.Root />
        </Field.Root>
      ));

      expect(getByRole('switch', { hidden: true })).toHaveAttribute('data-disabled', '');
    });
  });
});
