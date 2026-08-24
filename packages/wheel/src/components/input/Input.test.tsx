// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { Input } from './index';
import { Field } from '../field';

describe('<Input />', () => {
  it('renders a native input element', () => {
    const { getByRole } = render(() => <Input />);
    const input = getByRole('textbox');
    expect(input.tagName).toBe('INPUT');
  });

  it('forwards extra props to the input', () => {
    const { getByPlaceholderText } = render(() => <Input placeholder="name" />);
    expect(getByPlaceholderText('name')).not.toBe(null);
  });

  describe('uncontrolled', () => {
    it('renders the defaultValue', () => {
      const { getByRole } = render(() => <Input defaultValue="hello" />);
      expect((getByRole('textbox') as HTMLInputElement).value).toBe('hello');
    });

    it('updates its own value when typed into', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <Input />);
      const input = getByRole('textbox') as HTMLInputElement;

      await user.type(input, 'abc');

      expect(input.value).toBe('abc');
    });
  });

  describe('controlled', () => {
    it('follows the value prop', () => {
      const [value, setValue] = createSignal('a');
      const { getByRole } = render(() => <Input value={value()} />);
      const input = getByRole('textbox') as HTMLInputElement;

      expect(input.value).toBe('a');
      setValue('b');
      expect(input.value).toBe('b');
    });

    it('does not change value when typed into without an external update', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <Input value="fixed" />);
      const input = getByRole('textbox') as HTMLInputElement;

      await user.type(input, 'more text');

      expect(input.value).toBe('fixed');
    });
  });

  describe('prop: onValueChange', () => {
    it('fires with the next value and event details when changed', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const { getByRole } = render(() => <Input onValueChange={onValueChange} />);

      await user.type(getByRole('textbox'), 'a');

      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange.mock.calls[0][0]).toBe('a');
      expect(onValueChange.mock.calls[0][1].reason).toBe('none');
    });

    it('is called for every keystroke', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const { getByRole } = render(() => <Input onValueChange={onValueChange} />);

      await user.type(getByRole('textbox'), 'abc');

      expect(onValueChange).toHaveBeenCalledTimes(3);
      expect(onValueChange.mock.calls[2][0]).toBe('abc');
    });
  });

  describe('prop: disabled', () => {
    it('disables the input', () => {
      const { getByRole } = render(() => <Input disabled />);
      expect(getByRole('textbox')).toBeDisabled();
      expect(getByRole('textbox')).toHaveAttribute('data-disabled', '');
    });
  });

  describe('inside <Field.Root />', () => {
    it('applies data-touched, data-dirty, and data-filled driven by the surrounding Field.Root', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => (
        <Field.Root>
          <Input />
        </Field.Root>
      ));

      const input = getByRole('textbox');
      expect(input).not.toHaveAttribute('data-touched');
      expect(input).not.toHaveAttribute('data-dirty');
      expect(input).not.toHaveAttribute('data-filled');

      await user.type(input, 'a');
      expect(input).toHaveAttribute('data-dirty', '');
      expect(input).toHaveAttribute('data-filled', '');

      await user.click(document.body);
      expect(input).toHaveAttribute('data-touched', '');
    });

    it('is labelled and described by Field.Label/Field.Description automatically', () => {
      const { getByRole, getByText } = render(() => (
        <Field.Root>
          <Field.Label>Name</Field.Label>
          <Input />
          <Field.Description>Your full name</Field.Description>
        </Field.Root>
      ));

      const input = getByRole('textbox');
      expect(input).toHaveAttribute('aria-labelledby', getByText('Name').id);
      expect(input).toHaveAttribute('aria-describedby', getByText('Your full name').id);
    });

    it('propagates disabled from Field.Root', () => {
      const { getByRole } = render(() => (
        <Field.Root disabled>
          <Input />
        </Field.Root>
      ));

      expect(getByRole('textbox')).toBeDisabled();
      expect(getByRole('textbox')).toHaveAttribute('data-disabled', '');
    });
  });

  it('supports class as a function of state', () => {
    const [disabled, setDisabled] = createSignal(false);
    const { getByRole } = render(() => (
      <Input disabled={disabled()} class={(state) => (state.disabled ? 'off' : 'on')} />
    ));
    const input = getByRole('textbox');
    expect(input).toHaveClass('on');
    setDisabled(true);
    expect(input).toHaveClass('off');
  });

  it('supports asChild', () => {
    const { getByTestId } = render(() => (
      <Input asChild data-testid="input">
        {(props) => <input {...props} />}
      </Input>
    ));
    expect(getByTestId('input').tagName).toBe('INPUT');
  });
});
