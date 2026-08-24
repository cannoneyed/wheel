// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { RadioGroup } from './index';
import { Radio } from '../radio';
import { DirectionProvider } from '../direction-provider';
import { Fieldset } from '../fieldset';

describe('<RadioGroup />', () => {
  it('renders a div with role="radiogroup"', () => {
    const { getByRole } = render(() => <RadioGroup />);
    expect(getByRole('radiogroup').tagName).toBe('DIV');
  });

  it('forwards the id prop', () => {
    const { getByRole } = render(() => <RadioGroup id="group-id" />);
    expect(getByRole('radiogroup')).toHaveAttribute('id', 'group-id');
  });

  describe('value: uncontrolled', () => {
    it('selects an item when clicked and reflects it via aria-checked', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <RadioGroup>
          <Radio.Root value="a" data-testid="a" />
          <Radio.Root value="b" data-testid="b" />
        </RadioGroup>
      ));

      const a = getByTestId('a');
      const b = getByTestId('b');

      expect(a).toHaveAttribute('aria-checked', 'false');

      await user.click(a);
      expect(a).toHaveAttribute('aria-checked', 'true');
      expect(b).toHaveAttribute('aria-checked', 'false');

      await user.click(b);
      expect(a).toHaveAttribute('aria-checked', 'false');
      expect(b).toHaveAttribute('aria-checked', 'true');
    });

    it('honors defaultValue', () => {
      const { getByTestId } = render(() => (
        <RadioGroup defaultValue="b">
          <Radio.Root value="a" data-testid="a" />
          <Radio.Root value="b" data-testid="b" />
        </RadioGroup>
      ));

      expect(getByTestId('a')).toHaveAttribute('aria-checked', 'false');
      expect(getByTestId('b')).toHaveAttribute('aria-checked', 'true');
    });
  });

  describe('value: controlled', () => {
    it('follows the value prop and does not self-update without onValueChange applying it', async () => {
      const user = userEvent.setup();
      const [value, setValue] = createSignal('a');
      const { getByTestId } = render(() => (
        <RadioGroup value={value()}>
          <Radio.Root value="a" data-testid="a" />
          <Radio.Root value="b" data-testid="b" />
        </RadioGroup>
      ));

      expect(getByTestId('a')).toHaveAttribute('aria-checked', 'true');

      await user.click(getByTestId('b'));
      // No `onValueChange` handler applied the change back to the signal.
      expect(getByTestId('a')).toHaveAttribute('aria-checked', 'true');
      expect(getByTestId('b')).toHaveAttribute('aria-checked', 'false');

      setValue('b');
      expect(getByTestId('a')).toHaveAttribute('aria-checked', 'false');
      expect(getByTestId('b')).toHaveAttribute('aria-checked', 'true');
    });
  });

  describe('prop: onValueChange', () => {
    it('is called with the value and event details when an item is clicked', () => {
      const handleChange = vi.fn();
      const { getByTestId } = render(() => (
        <RadioGroup onValueChange={handleChange}>
          <Radio.Root value="a" data-testid="item" />
        </RadioGroup>
      ));

      fireEvent.click(getByTestId('item'));

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange.mock.calls[0][0]).toBe('a');
      expect(handleChange.mock.calls[0][1].reason).toBe('none');
    });

    it('does not change state when canceled', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <RadioGroup onValueChange={(_, details) => details.cancel()}>
          <Radio.Root value="a" data-testid="item" />
        </RadioGroup>
      ));

      const item = getByTestId('item');
      await user.click(item);

      expect(item).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('prop: disabled', () => {
    it('sets aria-disabled on the group and its items', () => {
      const { getByRole, getByTestId } = render(() => (
        <RadioGroup disabled>
          <Radio.Root value="a" data-testid="item" />
        </RadioGroup>
      ));

      expect(getByRole('radiogroup')).toHaveAttribute('aria-disabled', 'true');
      expect(getByTestId('item')).toHaveAttribute('aria-disabled', 'true');
    });

    it('prevents selection', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <RadioGroup disabled>
          <Radio.Root value="a" data-testid="item" />
        </RadioGroup>
      ));

      const item = getByTestId('item');
      await user.click(item);
      expect(item).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('prop: readOnly', () => {
    it('sets aria-readonly on the group', () => {
      const { getByRole } = render(() => <RadioGroup readOnly />);
      expect(getByRole('radiogroup')).toHaveAttribute('aria-readonly', 'true');
    });

    it('prevents selection', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <RadioGroup readOnly>
          <Radio.Root value="a" data-testid="item" />
        </RadioGroup>
      ));

      const item = getByTestId('item');
      await user.click(item);
      expect(item).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('keyboard navigation', () => {
    it('sets tabindex=0 on the initially checked item only', () => {
      const { getByTestId } = render(() => (
        <RadioGroup defaultValue="b">
          <Radio.Root value="a" data-testid="a" />
          <Radio.Root value="b" data-testid="b" />
        </RadioGroup>
      ));

      expect(getByTestId('a')).toHaveAttribute('tabindex', '-1');
      expect(getByTestId('b')).toHaveAttribute('tabindex', '0');
    });

    it('ArrowDown moves focus and automatically selects the next item', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <RadioGroup>
          <Radio.Root value="a" data-testid="a" />
          <Radio.Root value="b" data-testid="b" />
        </RadioGroup>
      ));

      const a = getByTestId('a');
      const b = getByTestId('b');

      a.focus();
      expect(a).toHaveAttribute('aria-checked', 'false');

      await user.keyboard('{ArrowDown}');

      expect(b).toHaveFocus();
      expect(b).toHaveAttribute('aria-checked', 'true');
      expect(a).toHaveAttribute('aria-checked', 'false');
    });

    it('wraps focus from the last item back to the first (loopFocus default)', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <RadioGroup>
          <Radio.Root value="a" data-testid="a" />
          <Radio.Root value="b" data-testid="b" />
        </RadioGroup>
      ));

      getByTestId('b').focus();
      await user.keyboard('{ArrowDown}');

      expect(getByTestId('a')).toHaveFocus();
    });

    it('does not navigate on Home/End (upstream disables them for RadioGroup)', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <RadioGroup>
          <Radio.Root value="a" data-testid="a" />
          <Radio.Root value="b" data-testid="b" />
        </RadioGroup>
      ));

      const a = getByTestId('a');
      a.focus();
      await user.keyboard('{End}');

      expect(a).toHaveFocus();
    });

    it('flips ArrowLeft/ArrowRight in RTL', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <DirectionProvider direction="rtl">
          <RadioGroup>
            <Radio.Root value="a" data-testid="a" />
            <Radio.Root value="b" data-testid="b" />
          </RadioGroup>
        </DirectionProvider>
      ));

      const a = getByTestId('a');
      const b = getByTestId('b');

      a.focus();
      await user.keyboard('{ArrowLeft}');

      expect(b).toHaveFocus();
    });
  });

  describe('form integration', () => {
    it('sets the name and value attributes on each radio input', () => {
      const { getByTestId, container } = render(() => (
        <RadioGroup name="radio-group">
          <Radio.Root value="a" data-testid="radio" />
        </RadioGroup>
      ));

      const input = container.querySelector('input[type="radio"]') as HTMLInputElement;
      expect(getByTestId('radio').nextElementSibling).toBe(input);
      expect(input).toHaveAttribute('name', 'radio-group');
      expect(input).toHaveAttribute('value', 'a');
    });

    it('points inputRef to the checked radio input and updates it on selection', async () => {
      const user = userEvent.setup();
      let groupInput: HTMLInputElement | null = null;

      const { getByTestId } = render(() => (
        <RadioGroup
          defaultValue="a"
          inputRef={(el) => {
            groupInput = el;
          }}
        >
          <Radio.Root value="a" data-testid="radio-a" />
          <Radio.Root value="b" data-testid="radio-b" />
        </RadioGroup>
      ));

      const inputA = getByTestId('radio-a').nextElementSibling as HTMLInputElement;
      const inputB = getByTestId('radio-b').nextElementSibling as HTMLInputElement;

      expect(groupInput).toBe(inputA);

      await user.click(getByTestId('radio-b'));

      expect(groupInput).toBe(inputB);
    });

    it('skips disabled radios when assigning inputRef', () => {
      let groupInput: HTMLInputElement | null = null;

      const { getByTestId } = render(() => (
        <RadioGroup
          inputRef={(el) => {
            groupInput = el;
          }}
        >
          <Radio.Root value="a" disabled data-testid="radio-a" />
          <Radio.Root value="b" data-testid="radio-b" />
        </RadioGroup>
      ));

      const inputB = getByTestId('radio-b').nextElementSibling as HTMLInputElement;
      expect(groupInput).toBe(inputB);
    });
  });

  describe('aria-labelledby', () => {
    it('falls back to the enclosing Fieldset legend id when unset', () => {
      const { getByRole } = render(() => (
        <Fieldset.Root>
          <Fieldset.Legend>My legend</Fieldset.Legend>
          <RadioGroup>
            <Radio.Root value="a" data-testid="a" />
          </RadioGroup>
        </Fieldset.Root>
      ));

      const group = getByRole('radiogroup');
      const legendId = group.getAttribute('aria-labelledby');
      expect(legendId).toBeTruthy();
      expect(document.getElementById(legendId!)).toHaveTextContent('My legend');
    });

    it('prefers an explicit aria-labelledby over the Fieldset legend', () => {
      const { getByRole } = render(() => (
        <Fieldset.Root>
          <Fieldset.Legend>My legend</Fieldset.Legend>
          <RadioGroup aria-labelledby="external-label">
            <Radio.Root value="a" data-testid="a" />
          </RadioGroup>
        </Fieldset.Root>
      ));

      expect(getByRole('radiogroup')).toHaveAttribute('aria-labelledby', 'external-label');
    });
  });

  describe('style hooks', () => {
    it('places data-disabled/data-readonly/data-required on the root', () => {
      const { getByRole } = render(() => <RadioGroup disabled readOnly required />);
      const root = getByRole('radiogroup');
      expect(root).toHaveAttribute('data-disabled', '');
      expect(root).toHaveAttribute('data-readonly', '');
      expect(root).toHaveAttribute('data-required', '');
    });
  });
});
