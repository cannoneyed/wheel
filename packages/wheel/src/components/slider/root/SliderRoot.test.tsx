// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { Slider } from '../index';
import { Field } from '../../field';
import { Form } from '../../form';
import { DirectionProvider } from '../../direction-provider';
import { REASONS } from '../../internals/reasons';
import {
  ARROW_RIGHT,
  ARROW_LEFT,
  ARROW_UP,
  ARROW_DOWN,
  HOME,
  END,
} from '../../internals/composite/composite';
import type { SliderRoot } from './SliderRoot';

afterEach(cleanup);

function TestSlider(props: SliderRoot.Props & { 'data-testid'?: string }) {
  return (
    <Slider.Root data-testid="root" {...props}>
      <Slider.Value data-testid="value" />
      <Slider.Control data-testid="control">
        <Slider.Track data-testid="track">
          <Slider.Indicator data-testid="indicator" />
          <Slider.Thumb data-testid="thumb" />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}

function TestRangeSlider(props: SliderRoot.Props) {
  return (
    <Slider.Root data-testid="root" {...props}>
      <Slider.Value data-testid="value" />
      <Slider.Control data-testid="control">
        <Slider.Track>
          <Slider.Indicator />
          <Slider.Thumb index={0} data-testid="thumb" />
          <Slider.Thumb index={1} data-testid="thumb" />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}

describe('<Slider.Root />', () => {
  describe('ARIA attributes', () => {
    it('has the correct aria attributes', () => {
      const { getByTestId, getByRole } = render(() => (
        <Slider.Root defaultValue={30} aria-labelledby="labelId" data-testid="root">
          <Slider.Value />
          <Slider.Control>
            <Slider.Track>
              <Slider.Indicator />
              <Slider.Thumb />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
      ));

      const root = getByTestId('root');
      const slider = getByRole('slider');

      expect(slider.tagName).toBe('INPUT');
      expect(root).toHaveAttribute('aria-labelledby', 'labelId');
      expect(slider).toHaveAttribute('aria-valuenow', '30');
      expect(slider).toHaveAttribute('aria-orientation', 'horizontal');
      expect(slider).toHaveAttribute('aria-labelledby', 'labelId');
      expect(slider).toHaveAttribute('step', '1');
    });

    it('updates aria-valuenow on change and keyboard interaction', async () => {
      const { getByRole } = render(() => <TestSlider defaultValue={50} />);
      const slider = getByRole('slider') as HTMLInputElement;

      slider.focus();
      slider.value = '51';
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      expect(slider).toHaveAttribute('aria-valuenow', '51');

      slider.dispatchEvent(new KeyboardEvent('keydown', { key: ARROW_RIGHT, bubbles: true }));
      expect(slider).toHaveAttribute('aria-valuenow', '52');
    });

    it('sets default aria-valuetext on range slider thumbs', () => {
      const { getAllByTestId } = render(() => <TestRangeSlider defaultValue={[44, 50]} />);
      const [thumb1, thumb2] = getAllByTestId('thumb');
      expect(thumb1.querySelector('input')).toHaveAttribute('aria-valuetext', '44 start range');
      expect(thumb2.querySelector('input')).toHaveAttribute('aria-valuetext', '50 end range');
    });
  });

  describe('prop: disabled', () => {
    it('renders data-disabled on all subcomponents', () => {
      const { getByTestId } = render(() => <TestSlider defaultValue={30} disabled />);

      ['root', 'value', 'control', 'track', 'indicator', 'thumb'].forEach((testId) => {
        expect(getByTestId(testId)).toHaveAttribute('data-disabled', '');
      });
    });

    it('does not drag a thumb disabled via the `disabled` prop', async () => {
      const handleValueChange = vi.fn();
      const { getByTestId } = render(() => (
        <Slider.Root defaultValue={[20, 80]} onValueChange={handleValueChange}>
          <Slider.Control data-testid="control">
            <Slider.Track>
              <Slider.Indicator />
              <Slider.Thumb index={0} data-testid="thumb-0" />
              <Slider.Thumb index={1} disabled data-testid="thumb-1" />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
      ));

      const control = getByTestId('control');
      vi.spyOn(control, 'getBoundingClientRect').mockImplementation(
        () =>
          ({
            width: 100,
            height: 10,
            bottom: 10,
            left: 0,
            x: 0,
            y: 0,
            top: 0,
            right: 100,
            toJSON() {},
          }) as DOMRect,
      );

      const disabledInput = getByTestId('thumb-1').querySelector('input')!;
      expect(disabledInput).toBeDisabled();

      const thumbEl = getByTestId('thumb-1');
      thumbEl.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, buttons: 1, clientX: 80 } as any),
      );
      document.body.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, buttons: 1, clientX: 40 } as any),
      );
      document.body.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, buttons: 1, clientX: 40 } as any),
      );

      expect(handleValueChange).not.toHaveBeenCalled();
      expect(disabledInput).toHaveAttribute('aria-valuenow', '80');
    });
  });

  describe('prop: orientation', () => {
    it('sets the aria-orientation and data-orientation attributes', () => {
      const { getByTestId, getByRole } = render(() => <TestSlider />);

      expect(getByRole('slider')).toHaveAttribute('aria-orientation', 'horizontal');
      expect(getByTestId('root')).toHaveAttribute('data-orientation', 'horizontal');
      expect(getByTestId('control')).toHaveAttribute('data-orientation', 'horizontal');
      expect(getByTestId('value')).toHaveAttribute('data-orientation', 'horizontal');
    });
  });

  describe('prop: step', () => {
    it('supports non-integer step values', () => {
      const { getByRole } = render(() => (
        <TestSlider value={51.1} min={-100} max={100} step={0.00000001} />
      ));
      expect(getByRole('slider')).toHaveAttribute('aria-valuenow', '51.1');
    });
  });

  describe('prop: max', () => {
    it('sets the max attribute on the input', () => {
      const { getByRole } = render(() => <TestSlider defaultValue={150} step={100} max={750} />);
      expect(getByRole('slider')).toHaveAttribute('max', '750');
    });

    it('should not go more than the max', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <TestSlider defaultValue={100} step={100} max={200} />);
      const slider = getByRole('slider');

      await user.keyboard('[Tab]');
      await user.keyboard(`[${ARROW_RIGHT}]`);
      expect(slider).toHaveAttribute('aria-valuenow', '200');
      await user.keyboard(`[${ARROW_RIGHT}]`);
      expect(slider).toHaveAttribute('aria-valuenow', '200');
    });
  });

  describe('prop: min', () => {
    it('sets the min attribute on the input', () => {
      const { getByRole } = render(() => (
        <TestSlider defaultValue={150} step={100} min={150} max={200} />
      ));
      expect(getByRole('slider')).toHaveAttribute('min', '150');
    });

    it('should not go less than the min', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <TestSlider defaultValue={1} step={1} min={0} />);
      const slider = getByRole('slider');

      await user.keyboard('[Tab]');
      await user.keyboard(`[${ARROW_LEFT}]`);
      expect(slider).toHaveAttribute('aria-valuenow', '0');
      await user.keyboard(`[${ARROW_LEFT}]`);
      expect(slider).toHaveAttribute('aria-valuenow', '0');
    });

    it('clamps range values that fall outside the min and max bounds', () => {
      const { getAllByRole } = render(() => (
        <TestRangeSlider defaultValue={[19, 41]} min={20} max={40} />
      ));
      const thumbs = getAllByRole('slider');
      expect(thumbs.map((thumb) => thumb.getAttribute('aria-valuenow'))).toEqual(['20', '40']);
    });
  });

  describe('prop: minStepsBetweenValues', () => {
    it('enforces a minimum difference between range slider values', async () => {
      const handleValueChange = vi.fn();
      const user = userEvent.setup();

      const { getAllByRole } = render(() => (
        <TestRangeSlider
          onValueChange={handleValueChange}
          defaultValue={[44, 50]}
          step={2}
          minStepsBetweenValues={2}
        />
      ));

      await user.keyboard('[Tab]');
      await user.keyboard(`[${ARROW_UP}]`);
      expect(handleValueChange).toHaveBeenCalledTimes(1);
      expect(handleValueChange.mock.calls[0][0]).toEqual([46, 50]);

      await user.keyboard(`[${ARROW_UP}]`);
      expect(handleValueChange).toHaveBeenCalledTimes(1);

      const [thumb1] = getAllByRole('slider');
      expect(thumb1).toHaveAttribute('aria-valuenow', '46');
    });
  });

  describe('prop: onValueCommitted', () => {
    it('does not commit a canceled change', async () => {
      const handleValueChange = vi.fn((_value: unknown, details: any) => details.cancel());
      const handleValueCommitted = vi.fn();

      const { getByRole } = render(() => (
        <Slider.Root
          defaultValue={50}
          onValueChange={handleValueChange}
          onValueCommitted={handleValueCommitted}
        >
          <Slider.Control>
            <Slider.Thumb />
          </Slider.Control>
        </Slider.Root>
      ));

      const slider = getByRole('slider');
      slider.focus();
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: ARROW_RIGHT, bubbles: true }));

      expect(handleValueChange).toHaveBeenCalledTimes(1);
      expect(handleValueCommitted).not.toHaveBeenCalled();
      expect(slider).toHaveAttribute('aria-valuenow', '50');
    });

    it('does not commit when keyboard interaction leaves the value unchanged', () => {
      const handleValueChange = vi.fn();
      const handleValueCommitted = vi.fn();

      const { getByRole } = render(() => (
        <Slider.Root
          defaultValue={100}
          onValueChange={handleValueChange}
          onValueCommitted={handleValueCommitted}
        >
          <Slider.Control>
            <Slider.Thumb />
          </Slider.Control>
        </Slider.Root>
      ));

      const slider = getByRole('slider');
      slider.focus();
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: ARROW_RIGHT, bubbles: true }));

      expect(handleValueChange).not.toHaveBeenCalled();
      expect(handleValueCommitted).not.toHaveBeenCalled();
      expect(slider).toHaveAttribute('aria-valuenow', '100');
    });

    it('commits on keyboard interaction with the keyboard reason', () => {
      const handleValueCommitted = vi.fn();

      const { getByRole } = render(() => (
        <TestSlider defaultValue={40} onValueCommitted={handleValueCommitted} />
      ));

      const slider = getByRole('slider');
      slider.focus();
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: ARROW_RIGHT, bubbles: true }));

      expect(handleValueCommitted).toHaveBeenCalledTimes(1);
      expect(handleValueCommitted.mock.calls[0][0]).toBe(41);
      expect(handleValueCommitted.mock.calls[0][1].reason).toBe(REASONS.keyboard);
    });
  });

  describe('prop: onValueChange', () => {
    it('provides the change reason for input events', () => {
      const handleValueChange = vi.fn();
      const { getByRole } = render(() => <TestSlider defaultValue={30} onValueChange={handleValueChange} />);

      const slider = getByRole('slider') as HTMLInputElement;
      slider.value = '35';
      slider.dispatchEvent(new Event('change', { bubbles: true }));

      expect(handleValueChange).toHaveBeenCalledTimes(1);
      const [, details] = handleValueChange.mock.calls[0];
      expect(details.reason).toBe(REASONS.inputChange);
      expect(details.activeThumbIndex).toBe(0);
    });

    it('provides the change reason for keyboard interactions', () => {
      const handleValueChange = vi.fn();
      const { getByRole } = render(() => <TestSlider defaultValue={40} onValueChange={handleValueChange} />);

      const slider = getByRole('slider');
      slider.focus();
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: ARROW_RIGHT, bubbles: true }));

      expect(handleValueChange).toHaveBeenCalledTimes(1);
      const [, details] = handleValueChange.mock.calls[0];
      expect(details.reason).toBe(REASONS.keyboard);
    });

    it('passes "name" and "value" as part of the event.target', () => {
      const handleValueChange = vi.fn().mockImplementation((_newValue, data) => data.event.target);

      const { getByRole } = render(() => (
        <TestSlider onValueChange={handleValueChange} name="change-testing" value={3} />
      ));

      const slider = getByRole('slider') as HTMLInputElement;
      slider.focus();
      slider.value = '4';
      slider.dispatchEvent(new Event('change', { bubbles: true }));

      expect(handleValueChange).toHaveBeenCalledTimes(1);
      const target = handleValueChange.mock.results[0]?.value;
      expect(target).toEqual({ name: 'change-testing', value: 4 });
    });
  });

  describe('keyboard interactions', () => {
    it('ltr/horizontal: ArrowRight increments and ArrowLeft decrements', async () => {
      const handleValueChange = vi.fn();
      const user = userEvent.setup();
      const { getByRole } = render(() => (
        <TestSlider defaultValue={20} onValueChange={handleValueChange} />
      ));

      const input = getByRole('slider');
      await user.keyboard('[Tab]');
      expect(input).toHaveFocus();

      await user.keyboard(`[${ARROW_RIGHT}]`);
      expect(handleValueChange.mock.calls[0][0]).toEqual(21);

      await user.keyboard(`[${ARROW_LEFT}]`);
      expect(handleValueChange.mock.calls[1][0]).toEqual(20);
    });

    it('ltr/horizontal: increments by largeStep when Shift is pressed', async () => {
      const handleValueChange = vi.fn();
      const user = userEvent.setup();
      const { getByRole } = render(() => (
        <TestSlider defaultValue={20} largeStep={10} onValueChange={handleValueChange} />
      ));

      const input = getByRole('slider');
      await user.keyboard('[Tab]');
      expect(input).toHaveFocus();

      await user.keyboard('{Shift>}{ArrowRight}');
      expect(handleValueChange.mock.calls[0][0]).toEqual(30);
    });

    it('rtl/horizontal: ArrowRight decrements and ArrowLeft increments', async () => {
      const handleValueChange = vi.fn();
      const user = userEvent.setup();
      const { getByRole } = render(() => (
        <div dir="rtl">
          <DirectionProvider direction="rtl">
            <Slider.Root defaultValue={20} onValueChange={handleValueChange}>
              <Slider.Control>
                <Slider.Thumb data-testid="thumb" />
              </Slider.Control>
            </Slider.Root>
          </DirectionProvider>
        </div>
      ));

      const input = getByRole('slider');
      await user.keyboard('[Tab]');
      expect(input).toHaveFocus();

      await user.keyboard(`[${ARROW_RIGHT}]`);
      expect(handleValueChange.mock.calls[0][0]).toEqual(19);

      await user.keyboard(`[${ARROW_LEFT}]`);
      expect(handleValueChange.mock.calls[1][0]).toEqual(20);
    });

    it('vertical: ArrowUp increments and ArrowDown decrements', async () => {
      const handleValueChange = vi.fn();
      const user = userEvent.setup();
      const { getByRole } = render(() => (
        <Slider.Root orientation="vertical" defaultValue={20} onValueChange={handleValueChange}>
          <Slider.Control>
            <Slider.Thumb data-testid="thumb" />
          </Slider.Control>
        </Slider.Root>
      ));

      const input = getByRole('slider');
      expect(input).toHaveAttribute('aria-orientation', 'vertical');

      await user.keyboard('[Tab]');
      await user.keyboard(`[${ARROW_UP}]`);
      expect(handleValueChange.mock.calls[0][0]).toEqual(21);

      await user.keyboard(`[${ARROW_DOWN}]`);
      expect(handleValueChange.mock.calls[1][0]).toEqual(20);
    });

    describe('key: End', () => {
      it('sets value to max in a single value slider', async () => {
        const handleValueChange = vi.fn();
        const user = userEvent.setup();
        const { getByRole } = render(() => (
          <TestSlider defaultValue={20} max={77} onValueChange={handleValueChange} />
        ));

        await user.keyboard('[Tab]');
        await user.keyboard(`[${END}]`);
        expect(handleValueChange.mock.calls[0][0]).toEqual(77);
        expect(getByRole('slider')).toHaveAttribute('aria-valuenow', '77');
      });

      it('sets value to the maximum possible value in a range slider', async () => {
        const handleValueChange = vi.fn();
        const user = userEvent.setup();
        const { getAllByRole } = render(() => (
          <TestRangeSlider defaultValue={[20, 50]} max={77} onValueChange={handleValueChange} />
        ));

        const [input1, input2] = getAllByRole('slider');
        await user.keyboard('[Tab]');
        expect(input1).toHaveFocus();
        await user.keyboard(`[${END}]`);
        expect(handleValueChange.mock.calls[0][0]).toEqual([50, 50]);

        await user.keyboard('[Tab]');
        expect(input2).toHaveFocus();
        await user.keyboard(`[${END}]`);
        expect(handleValueChange.mock.calls[1][0]).toEqual([50, 77]);
      });
    });

    describe('key: Home', () => {
      it('sets value to min in a single value slider', async () => {
        const handleValueChange = vi.fn();
        const user = userEvent.setup();
        const { getByRole } = render(() => (
          <TestSlider defaultValue={20} min={17} onValueChange={handleValueChange} />
        ));

        await user.keyboard('[Tab]');
        await user.keyboard(`[${HOME}]`);
        expect(handleValueChange.mock.calls[0][0]).toEqual(17);
        expect(getByRole('slider')).toHaveAttribute('aria-valuenow', '17');
      });
    });

    describe('key: PageUp / PageDown', () => {
      it('increments and decrements the value by largeStep', async () => {
        const handleValueChange = vi.fn();
        const user = userEvent.setup();
        const { getByRole } = render(() => (
          <TestSlider defaultValue={20} largeStep={5} onValueChange={handleValueChange} />
        ));

        await user.keyboard('[Tab]');
        await user.keyboard('[PageUp]');
        expect(handleValueChange.mock.calls[0][0]).toEqual(25);
        expect(getByRole('slider')).toHaveAttribute('aria-valuenow', '25');

        await user.keyboard('[PageDown]');
        expect(handleValueChange.mock.calls[1][0]).toEqual(20);
      });
    });
  });

  describe('controlled', () => {
    it('follows the value prop for a single-thumb slider', () => {
      const [value, setValue] = createSignal(20);
      const { getByRole } = render(() => <TestSlider value={value()} />);
      const slider = getByRole('slider');
      expect(slider).toHaveAttribute('aria-valuenow', '20');
      setValue(60);
      expect(slider).toHaveAttribute('aria-valuenow', '60');
    });

    it('follows the value prop for a range slider', () => {
      const [value, setValue] = createSignal<number[]>([10, 20]);
      const { getAllByRole } = render(() => <TestRangeSlider value={value()} />);
      const [thumb1, thumb2] = getAllByRole('slider');
      expect(thumb1).toHaveAttribute('aria-valuenow', '10');
      expect(thumb2).toHaveAttribute('aria-valuenow', '20');
      setValue([15, 25]);
      expect(thumb1).toHaveAttribute('aria-valuenow', '15');
      expect(thumb2).toHaveAttribute('aria-valuenow', '25');
    });
  });

  describe('Field integration', () => {
    it('receives disabled prop from Field.Root', () => {
      const { getByTestId } = render(() => (
        <Field.Root disabled>
          <Slider.Root data-testid="root">
            <Slider.Control>
              <Slider.Thumb />
            </Slider.Control>
          </Slider.Root>
        </Field.Root>
      ));

      expect(getByTestId('root')).toHaveAttribute('data-disabled', '');
    });

    it('receives name prop from Field.Root', () => {
      const { getByRole } = render(() => (
        <Field.Root name="field-slider">
          <Slider.Root>
            <Slider.Control>
              <Slider.Thumb />
            </Slider.Control>
          </Slider.Root>
        </Field.Root>
      ));

      expect(getByRole('slider')).toHaveAttribute('name', 'field-slider');
    });

    it('applies data-touched on blur', () => {
      const { getByTestId, getByRole } = render(() => (
        <Field.Root>
          <Slider.Root data-testid="root">
            <Slider.Control>
              <Slider.Thumb />
            </Slider.Control>
          </Slider.Root>
        </Field.Root>
      ));

      const root = getByTestId('root');
      const input = getByRole('slider');

      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      expect(root).toHaveAttribute('data-touched', '');
    });

    it('applies data-dirty after a value change', () => {
      const { getByTestId, getByRole } = render(() => (
        <Field.Root>
          <Slider.Root data-testid="root">
            <Slider.Control>
              <Slider.Thumb />
            </Slider.Control>
          </Slider.Root>
        </Field.Root>
      ));

      const root = getByTestId('root');
      const input = getByRole('slider') as HTMLInputElement;

      expect(root).not.toHaveAttribute('data-dirty');

      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ARROW_RIGHT, bubbles: true }));

      expect(root).toHaveAttribute('data-dirty', '');
    });

    it('applies data-focused while the slider is focused', () => {
      const { getByTestId, getByRole } = render(() => (
        <Field.Root>
          <Slider.Root data-testid="root">
            <Slider.Control>
              <Slider.Thumb />
            </Slider.Control>
          </Slider.Root>
        </Field.Root>
      ));

      const root = getByTestId('root');
      const input = getByRole('slider');

      expect(root).not.toHaveAttribute('data-focused');
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      expect(root).toHaveAttribute('data-focused', '');
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      expect(root).not.toHaveAttribute('data-focused');
    });
  });

  describe('Form integration', () => {
    it('clears external errors on change', () => {
      const { getByTestId, getByRole } = render(() => (
        <Form errors={{ test: 'test' }}>
          <Field.Root name="test" data-testid="field">
            <TestSlider data-testid="slider" defaultValue={50} />
            <Field.Error data-testid="error" />
          </Field.Root>
        </Form>
      ));

      const slider = getByRole('slider');
      expect(slider).toHaveAttribute('aria-invalid', 'true');
      expect(getByTestId('error')).toHaveTextContent('test');

      slider.focus();
      slider.dispatchEvent(
        new KeyboardEvent('keydown', { key: ARROW_RIGHT, shiftKey: true, bubbles: true }),
      );

      expect(slider).not.toHaveAttribute('aria-invalid');
    });

    it('names the range input(s) for form submission', () => {
      const { getAllByRole } = render(() => (
        <Form>
          <Field.Root name="slider">
            <Slider.Root defaultValue={[25, 50]}>
              <Slider.Control>
                <Slider.Thumb />
                <Slider.Thumb />
              </Slider.Control>
            </Slider.Root>
          </Field.Root>
        </Form>
      ));

      const inputs = getAllByRole('slider');
      inputs.forEach((input) => expect(input).toHaveAttribute('name', 'slider'));
    });
  });
});
