// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { CheckboxGroup } from './index';
import { Checkbox } from '../checkbox';

describe('<CheckboxGroup />', () => {
  it('renders a div with role="group"', () => {
    const { getByRole } = render(() => <CheckboxGroup />);
    expect(getByRole('group').tagName).toBe('DIV');
  });

  it('forwards the id prop', () => {
    const { getByRole } = render(() => <CheckboxGroup id="group-id" />);
    expect(getByRole('group')).toHaveAttribute('id', 'group-id');
  });

  describe('prop: value', () => {
    it('controls the checked state of children and updates on click', async () => {
      const user = userEvent.setup();
      const [value, setValue] = createSignal(['red']);
      const { getByTestId } = render(() => (
        <CheckboxGroup value={value()} onValueChange={setValue}>
          <Checkbox.Root value="red" data-testid="red" />
          <Checkbox.Root value="green" data-testid="green" />
          <Checkbox.Root value="blue" data-testid="blue" />
        </CheckboxGroup>
      ));

      const red = getByTestId('red');
      const green = getByTestId('green');
      const blue = getByTestId('blue');

      expect(red).toHaveAttribute('aria-checked', 'true');
      expect(green).toHaveAttribute('aria-checked', 'false');
      expect(blue).toHaveAttribute('aria-checked', 'false');

      await user.click(green);

      expect(red).toHaveAttribute('aria-checked', 'true');
      expect(green).toHaveAttribute('aria-checked', 'true');
      expect(blue).toHaveAttribute('aria-checked', 'false');

      await user.click(red);

      expect(red).toHaveAttribute('aria-checked', 'false');
      expect(green).toHaveAttribute('aria-checked', 'true');
    });

    it('does not self-update without onValueChange applying it (fully controlled)', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <CheckboxGroup value={['red']}>
          <Checkbox.Root value="red" data-testid="red" />
          <Checkbox.Root value="green" data-testid="green" />
        </CheckboxGroup>
      ));

      const green = getByTestId('green');
      await user.click(green);

      expect(green).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('prop: defaultValue', () => {
    it('sets the initial (uncontrolled) value and updates on click', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <CheckboxGroup defaultValue={['red']}>
          <Checkbox.Root value="red" data-testid="red" />
          <Checkbox.Root value="green" data-testid="green" />
        </CheckboxGroup>
      ));

      const red = getByTestId('red');
      const green = getByTestId('green');

      expect(red).toHaveAttribute('aria-checked', 'true');
      expect(green).toHaveAttribute('aria-checked', 'false');

      await user.click(green);

      expect(red).toHaveAttribute('aria-checked', 'true');
      expect(green).toHaveAttribute('aria-checked', 'true');
    });

    it('treats an omitted defaultValue as an empty array', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <CheckboxGroup>
          <Checkbox.Root value="red" data-testid="red" />
          <Checkbox.Root value="green" data-testid="green" />
        </CheckboxGroup>
      ));

      expect(getByTestId('red')).toHaveAttribute('aria-checked', 'false');
      expect(getByTestId('green')).toHaveAttribute('aria-checked', 'false');

      await user.click(getByTestId('red'));
      expect(getByTestId('red')).toHaveAttribute('aria-checked', 'true');
    });
  });

  describe('prop: onValueChange', () => {
    it('is called with the next value and event details when a child is clicked', () => {
      const handleValueChange = vi.fn();

      const { getByTestId } = render(() => (
        <CheckboxGroup onValueChange={handleValueChange}>
          <Checkbox.Root value="red" data-testid="red" />
          <Checkbox.Root value="green" data-testid="green" />
        </CheckboxGroup>
      ));

      fireEvent.click(getByTestId('red'));
      expect(handleValueChange).toHaveBeenCalledTimes(1);
      expect(handleValueChange.mock.calls[0][0]).toEqual(['red']);
      expect(handleValueChange.mock.calls[0][1].reason).toBe('none');

      fireEvent.click(getByTestId('green'));
      expect(handleValueChange.mock.calls[1][0]).toEqual(['red', 'green']);
    });

    it('does not update the group when onValueChange cancels the event', () => {
      const handleValueChange = vi.fn((_: string[], eventDetails: CheckboxGroup.ChangeEventDetails) => {
        eventDetails.cancel();
      });

      const { getByTestId } = render(() => (
        <CheckboxGroup onValueChange={handleValueChange}>
          <Checkbox.Root value="red" data-testid="red" />
          <Checkbox.Root value="green" data-testid="green" />
        </CheckboxGroup>
      ));

      const red = getByTestId('red');
      const green = getByTestId('green');

      fireEvent.click(red);

      expect(handleValueChange).toHaveBeenCalledTimes(1);
      expect(red).toHaveAttribute('aria-checked', 'false');
      expect(green).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('prop: disabled', () => {
    it('disables all checkboxes in the group', () => {
      const { getByTestId } = render(() => (
        <CheckboxGroup disabled>
          <Checkbox.Root value="red" data-testid="red" />
          <Checkbox.Root value="green" data-testid="green" />
        </CheckboxGroup>
      ));

      expect(getByTestId('red')).toHaveAttribute('aria-disabled', 'true');
      expect(getByTestId('green')).toHaveAttribute('aria-disabled', 'true');
    });

    it('takes precedence over an individual checkbox opting out', () => {
      const { getByTestId } = render(() => (
        <CheckboxGroup disabled>
          <Checkbox.Root value="red" disabled={false} data-testid="red" />
        </CheckboxGroup>
      ));

      expect(getByTestId('red')).toHaveAttribute('aria-disabled', 'true');
    });

    it('places data-disabled on the group root', () => {
      const { getByRole } = render(() => <CheckboxGroup disabled />);
      expect(getByRole('group')).toHaveAttribute('data-disabled', '');
    });
  });

  describe('parent checkbox (tri-state)', () => {
    const allValues = ['a', 'b', 'c'];

    it('checks/unchecks all children when the parent is clicked', async () => {
      const user = userEvent.setup();
      const [value, setValue] = createSignal<string[]>([]);
      const { getByTestId } = render(() => (
        <CheckboxGroup value={value()} onValueChange={setValue} allValues={allValues}>
          <Checkbox.Root parent data-testid="parent" />
          <Checkbox.Root value="a" data-testid="a" />
          <Checkbox.Root value="b" data-testid="b" />
          <Checkbox.Root value="c" data-testid="c" />
        </CheckboxGroup>
      ));

      const parent = getByTestId('parent');
      const a = getByTestId('a');
      const b = getByTestId('b');
      const c = getByTestId('c');

      expect(parent).toHaveAttribute('aria-checked', 'false');

      await user.click(parent);
      expect(parent).toHaveAttribute('aria-checked', 'true');
      expect(a).toHaveAttribute('aria-checked', 'true');
      expect(b).toHaveAttribute('aria-checked', 'true');
      expect(c).toHaveAttribute('aria-checked', 'true');

      await user.click(parent);
      expect(parent).toHaveAttribute('aria-checked', 'false');
      expect(a).toHaveAttribute('aria-checked', 'false');
      expect(b).toHaveAttribute('aria-checked', 'false');
      expect(c).toHaveAttribute('aria-checked', 'false');
    });

    it('marks the parent as mixed (aria-checked="mixed") when some children are checked', async () => {
      const user = userEvent.setup();
      const [value, setValue] = createSignal<string[]>([]);
      const { getByTestId } = render(() => (
        <CheckboxGroup value={value()} onValueChange={setValue} allValues={allValues}>
          <Checkbox.Root parent data-testid="parent" />
          <Checkbox.Root value="a" data-testid="a" />
          <Checkbox.Root value="b" data-testid="b" />
          <Checkbox.Root value="c" data-testid="c" />
        </CheckboxGroup>
      ));

      await user.click(getByTestId('a'));

      expect(getByTestId('parent')).toHaveAttribute('aria-checked', 'mixed');
      expect(getByTestId('a')).toHaveAttribute('aria-checked', 'true');
    });

    it('updates the group value from a child click without duplicate callbacks', () => {
      const handleValueChange = vi.fn();

      const { getByTestId } = render(() => (
        <CheckboxGroup allValues={allValues} onValueChange={handleValueChange}>
          <Checkbox.Root parent data-testid="parent" />
          <Checkbox.Root value="a" data-testid="a" />
          <Checkbox.Root value="b" data-testid="b" />
          <Checkbox.Root value="c" data-testid="c" />
        </CheckboxGroup>
      ));

      fireEvent.click(getByTestId('a'));

      expect(handleValueChange).toHaveBeenCalledTimes(1);
      expect(handleValueChange.mock.calls[0][0]).toEqual(['a']);
      expect(getByTestId('parent')).toHaveAttribute('aria-checked', 'mixed');

      fireEvent.click(getByTestId('parent'));

      expect(handleValueChange).toHaveBeenCalledTimes(2);
      expect(handleValueChange.mock.calls[1][0]).toEqual(['a', 'b', 'c']);
    });

    it('applies a space-separated aria-controls attribute referencing the children', () => {
      const { getByTestId } = render(() => (
        <CheckboxGroup allValues={allValues}>
          <Checkbox.Root parent data-testid="parent" />
          <Checkbox.Root value="a" />
          <Checkbox.Root value="b" />
          <Checkbox.Root value="c" />
        </CheckboxGroup>
      ));

      const parent = getByTestId('parent');
      const id = parent.getAttribute('id');

      expect(parent).toHaveAttribute(
        'aria-controls',
        allValues.map((v) => `${id}-${v}`).join(' '),
      );
    });

    it('lets a child checkbox cancel a parent-enabled group change', () => {
      const handleValueChange = vi.fn();
      const handleChildChange = vi.fn((_: boolean, eventDetails: Checkbox.Root.ChangeEventDetails) => {
        eventDetails.cancel();
      });

      const { getByTestId } = render(() => (
        <CheckboxGroup allValues={allValues} onValueChange={handleValueChange}>
          <Checkbox.Root parent data-testid="parent" />
          <Checkbox.Root value="a" data-testid="a" onCheckedChange={handleChildChange} />
        </CheckboxGroup>
      ));

      fireEvent.click(getByTestId('a'));

      expect(handleChildChange).toHaveBeenCalledTimes(1);
      expect(handleValueChange).not.toHaveBeenCalled();
      expect(getByTestId('a')).toHaveAttribute('aria-checked', 'false');
      expect(getByTestId('parent')).toHaveAttribute('aria-checked', 'false');
    });

    it('handles disabled children when toggling the parent', () => {
      const [value, setValue] = createSignal<string[]>([]);
      const { getByTestId } = render(() => (
        <CheckboxGroup value={value()} onValueChange={setValue} allValues={allValues}>
          <Checkbox.Root parent data-testid="parent" />
          <Checkbox.Root value="a" disabled data-testid="a" />
          <Checkbox.Root value="b" data-testid="b" />
          <Checkbox.Root value="c" data-testid="c" />
        </CheckboxGroup>
      ));

      fireEvent.click(getByTestId('parent'));

      expect(getByTestId('parent')).toHaveAttribute('aria-checked', 'mixed');
      expect(getByTestId('a')).toHaveAttribute('aria-checked', 'false');
      expect(getByTestId('b')).toHaveAttribute('aria-checked', 'true');
    });
  });

  describe('form integration', () => {
    it('sets the name attribute on each child checkbox input', () => {
      const { container } = render(() => (
        <CheckboxGroup>
          <Checkbox.Root name="red" data-testid="red" />
          <Checkbox.Root name="green" data-testid="green" />
        </CheckboxGroup>
      ));

      const inputs = container.querySelectorAll('input[type="checkbox"]');
      expect(inputs[0]).toHaveAttribute('name', 'red');
      expect(inputs[1]).toHaveAttribute('name', 'green');
    });

    it('excludes the parent checkbox from form submission (no name on its input)', () => {
      const { container } = render(() => (
        <CheckboxGroup allValues={['a', 'b']}>
          <Checkbox.Root parent name="parent-checkbox" data-testid="parent" />
          <Checkbox.Root value="a" name="a" />
          <Checkbox.Root value="b" name="b" />
        </CheckboxGroup>
      ));

      const inputs = Array.from(container.querySelectorAll('input[type="checkbox"]'));
      expect(inputs[0]).not.toHaveAttribute('name');
    });

    it('checked children submit their value', async () => {
      const user = userEvent.setup();
      const { container, getByTestId } = render(() => (
        <CheckboxGroup defaultValue={['fuji-apple']}>
          <Checkbox.Root value="fuji-apple" name="apple" data-testid="fuji" />
          <Checkbox.Root value="gala-apple" name="apple" data-testid="gala" />
        </CheckboxGroup>
      ));

      const inputs = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
      expect(inputs[0].checked).toBe(true);
      expect(inputs[0]).toHaveAttribute('value', 'fuji-apple');
      expect(inputs[1].checked).toBe(false);

      await user.click(getByTestId('gala'));
      expect(inputs[1].checked).toBe(true);
      expect(inputs[1]).toHaveAttribute('value', 'gala-apple');
    });
  });
});
