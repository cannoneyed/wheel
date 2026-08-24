// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { Field } from '../index';
import { CheckboxGroup } from '../../checkbox-group';
import { Checkbox } from '../../checkbox';
import { RadioGroup } from '../../radio-group';
import { Radio } from '../../radio';

describe('<Field.Item />', () => {
  describe('prop: disabled', () => {
    it('reflects disabled state on the item', () => {
      const { getByTestId } = render(() => (
        <Field.Root>
          <Field.Item disabled data-testid="item" />
        </Field.Root>
      ));

      expect(getByTestId('item')).toHaveAttribute('data-disabled', '');
    });

    it('disables a wrapped checkbox', async () => {
      const onValueChange = vi.fn();
      const user = userEvent.setup();
      const { getAllByRole } = render(() => (
        <Field.Root name="apple">
          <CheckboxGroup defaultValue={[]} onValueChange={onValueChange}>
            <Field.Item disabled>
              <Checkbox.Root value="fuji-apple" />
            </Field.Item>
            <Field.Item>
              <Checkbox.Root value="gala-apple" />
            </Field.Item>
          </CheckboxGroup>
        </Field.Root>
      ));

      const [checkbox1, checkbox2] = getAllByRole('checkbox');
      await user.click(checkbox1);
      expect(onValueChange).not.toHaveBeenCalled();
      await user.click(checkbox2);
      expect(onValueChange).toHaveBeenCalledTimes(1);
    });

    it('disables a wrapped radio', async () => {
      const onValueChange = vi.fn();
      const user = userEvent.setup();
      const { getAllByRole } = render(() => (
        <Field.Root name="apple">
          <RadioGroup defaultValue="">
            <Field.Item disabled>
              <Radio.Root value="fuji-apple" />
            </Field.Item>
            <Field.Item>
              <Radio.Root value="gala-apple" onClick={onValueChange} />
            </Field.Item>
          </RadioGroup>
        </Field.Root>
      ));

      const [radio1, radio2] = getAllByRole('radio');
      expect(radio1).toHaveAttribute('data-disabled', '');
      expect(radio2).not.toHaveAttribute('data-disabled');
      await user.click(radio2);
      expect(onValueChange).toHaveBeenCalled();
    });
  });
});
