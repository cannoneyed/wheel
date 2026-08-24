// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Separator } from './Separator';

describe('<Separator />', () => {
  it('renders a div with role="separator"', () => {
    const { getByRole } = render(() => <Separator />);
    const separator = getByRole('separator');
    expect(separator.tagName).toBe('DIV');
  });

  describe('prop: orientation', () => {
    it('defaults to horizontal with matching aria-orientation and data attribute', () => {
      const { getByRole } = render(() => <Separator />);
      const separator = getByRole('separator');
      expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
      expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('sets vertical orientation', () => {
      const { getByRole } = render(() => <Separator orientation="vertical" />);
      const separator = getByRole('separator');
      expect(separator).toHaveAttribute('aria-orientation', 'vertical');
      expect(separator).toHaveAttribute('data-orientation', 'vertical');
    });

    it('updates reactively', () => {
      const [orientation, setOrientation] = createSignal<'horizontal' | 'vertical'>('horizontal');
      const { getByRole } = render(() => <Separator orientation={orientation()} />);
      const separator = getByRole('separator');
      setOrientation('vertical');
      expect(separator).toHaveAttribute('aria-orientation', 'vertical');
      expect(separator).toHaveAttribute('data-orientation', 'vertical');
    });
  });

  it('supports class as a function of state', () => {
    const { getByRole } = render(() => (
      <Separator class={(state) => `sep-${state.orientation}`} />
    ));
    expect(getByRole('separator')).toHaveClass('sep-horizontal');
  });
});
