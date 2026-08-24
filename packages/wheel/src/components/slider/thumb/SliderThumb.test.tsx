// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@solidjs/testing-library';
import { Slider } from '../index';
import { ARROW_RIGHT } from '../../internals/composite/composite';

afterEach(cleanup);

describe('<Slider.Thumb />', () => {
  describe('ARIA attributes', () => {
    it('forwards aria-label to the input', () => {
      const { getByRole } = render(() => (
        <Slider.Root defaultValue={30}>
          <Slider.Control>
            <Slider.Thumb aria-label="Volume" />
          </Slider.Control>
        </Slider.Root>
      ));

      expect(getByRole('slider')).toHaveAttribute('aria-label', 'Volume');
    });

    it('prefers getAriaValueText over a direct aria-valuetext prop', () => {
      const { getByRole } = render(() => (
        <Slider.Root defaultValue={30}>
          <Slider.Control>
            <Slider.Thumb
              aria-valuetext="ignored"
              getAriaValueText={(formattedValue) => `${formattedValue} units`}
            />
          </Slider.Control>
        </Slider.Root>
      ));

      expect(getByRole('slider')).toHaveAttribute('aria-valuetext', '30 units');
    });
  });

  describe('prop: onKeyDown', () => {
    it('forwards key events that the slider does not handle', () => {
      const handleKeyDown = vi.fn();
      const { getByRole } = render(() => (
        <Slider.Root defaultValue={30}>
          <Slider.Control>
            <Slider.Thumb onKeyDown={handleKeyDown} />
          </Slider.Control>
        </Slider.Root>
      ));

      const input = getByRole('slider');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(handleKeyDown).toHaveBeenCalledTimes(1);
    });

    it('allows preventing the internal key handling', () => {
      const handleValueChange = vi.fn();
      const { getByRole } = render(() => (
        <Slider.Root defaultValue={30} onValueChange={handleValueChange}>
          <Slider.Control>
            <Slider.Thumb
              onKeyDown={(event) => (event as any).preventBaseUIHandler?.()}
            />
          </Slider.Control>
        </Slider.Root>
      ));

      const input = getByRole('slider');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ARROW_RIGHT, bubbles: true }));

      expect(handleValueChange).not.toHaveBeenCalled();
      expect(input).toHaveAttribute('aria-valuenow', '30');
    });
  });

  describe('prop: tabIndex', () => {
    it('does not apply a tabIndex to the input by default', () => {
      const { getByRole } = render(() => (
        <Slider.Root defaultValue={30}>
          <Slider.Control>
            <Slider.Thumb />
          </Slider.Control>
        </Slider.Root>
      ));

      expect(getByRole('slider')).not.toHaveAttribute('tabindex');
    });

    it('can be removed from the tab sequence', () => {
      const { getByRole } = render(() => (
        <Slider.Root defaultValue={30}>
          <Slider.Control>
            <Slider.Thumb tabIndex={-1} />
          </Slider.Control>
        </Slider.Root>
      ));

      expect(getByRole('slider')).toHaveAttribute('tabindex', '-1');
    });
  });

  describe('prop: disabled', () => {
    it('disables the nested input', () => {
      const { getByRole } = render(() => (
        <Slider.Root defaultValue={30}>
          <Slider.Control>
            <Slider.Thumb disabled />
          </Slider.Control>
        </Slider.Root>
      ));

      expect(getByRole('slider', { hidden: true })).toBeDisabled();
    });

    it('does not respond to keyboard interaction when disabled', () => {
      const handleValueChange = vi.fn();
      const { getByRole } = render(() => (
        <Slider.Root defaultValue={30} onValueChange={handleValueChange}>
          <Slider.Control>
            <Slider.Thumb disabled />
          </Slider.Control>
        </Slider.Root>
      ));

      const input = getByRole('slider', { hidden: true });
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ARROW_RIGHT, bubbles: true }));
      expect(handleValueChange).not.toHaveBeenCalled();
    });
  });

  describe('range slider', () => {
    it('renders a distinct data-index per thumb', () => {
      const { getAllByRole } = render(() => (
        <Slider.Root defaultValue={[10, 20]}>
          <Slider.Control>
            <Slider.Thumb index={0} data-testid="thumb-0" />
            <Slider.Thumb index={1} data-testid="thumb-1" />
          </Slider.Control>
        </Slider.Root>
      ));

      const [thumb1, thumb2] = getAllByRole('slider');
      expect(thumb1.closest('[data-index]')).toHaveAttribute('data-index', '0');
      expect(thumb2.closest('[data-index]')).toHaveAttribute('data-index', '1');
    });
  });
});
