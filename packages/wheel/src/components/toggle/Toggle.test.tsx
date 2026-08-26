// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { Toggle } from './Toggle';
import { ToggleGroup } from '../toggle-group/ToggleGroup';

describe('<Toggle />', () => {
  it('renders the stable identity with default variant and size', () => {
    const { getByRole } = render(() => <Toggle label="Bold" />);
    const button = getByRole('button', { name: 'Bold' });

    expect(button).toHaveClass('wheel-Toggle');
    expect(button).toHaveAttribute('data-slot', 'toggle');
    expect(button).toHaveAttribute('data-variant', 'ghost');
    expect(button).toHaveAttribute('data-size', 'md');
  });

  it('uses label as the accessible name and swaps the pressed icon', async () => {
    const user = userEvent.setup();
    const { getByRole, getByTestId, queryByTestId } = render(() => (
      <Toggle
        label="Favorite"
        icon={<svg data-testid="outline" />}
        pressedIcon={<svg data-testid="filled" />}
      />
    ));
    const button = getByRole('button', { name: 'Favorite' });

    expect(button).toHaveAttribute('data-icon-only');
    expect(getByTestId('outline')).toBeInTheDocument();
    expect(queryByTestId('filled')).toBeNull();

    await user.click(button);
    expect(getByTestId('filled')).toBeInTheDocument();
    expect(queryByTestId('outline')).toBeNull();
  });

  it('renders visible label content beside an icon', () => {
    const { getByRole, getByText } = render(() => (
      <Toggle label="Favorite" icon={<svg />}>Star</Toggle>
    ));
    expect(getByRole('button', { name: 'Star' })).not.toHaveAttribute('data-icon-only');
    expect(getByText('Star')).toBeInTheDocument();
  });

  it('inherits group variant and size while keeping its identity', () => {
    const { getByRole } = render(() => (
      <ToggleGroup aria-label="Format" size="lg" variant="primary">
        <Toggle value="bold" label="Bold" />
      </ToggleGroup>
    ));
    const button = getByRole('button', { name: 'Bold' });

    expect(button).toHaveClass('wheel-Toggle');
    expect(button).toHaveAttribute('data-slot', 'toggle');
    expect(button).toHaveAttribute('data-size', 'lg');
    expect(button).toHaveAttribute('data-variant', 'primary');
  });

  it('renders a button with aria-pressed', () => {
    const { getByRole } = render(() => <Toggle />);
    const button = getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('type', 'button');
  });

  describe('uncontrolled', () => {
    it('toggles pressed state on click', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <Toggle defaultPressed={false} />);
      const button = getByRole('button');

      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(button).not.toHaveAttribute('data-pressed');

      await user.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(button).toHaveAttribute('data-pressed', '');

      await user.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(button).not.toHaveAttribute('data-pressed');
    });

    it('respects defaultPressed', () => {
      const { getByRole } = render(() => <Toggle defaultPressed />);
      expect(getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('controlled', () => {
    it('follows the pressed prop', () => {
      const [pressed, setPressed] = createSignal(false);
      const { getByRole } = render(() => <Toggle pressed={pressed()} />);
      const button = getByRole('button');

      expect(button).toHaveAttribute('aria-pressed', 'false');
      setPressed(true);
      expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it('does not change state on click without external update', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <Toggle pressed={false} />);
      const button = getByRole('button');
      await user.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('prop: onPressedChange', () => {
    it('fires with the next state and event details', async () => {
      const user = userEvent.setup();
      const onPressedChange = vi.fn();
      const { getByRole } = render(() => <Toggle onPressedChange={onPressedChange} />);

      await user.click(getByRole('button'));
      expect(onPressedChange).toHaveBeenCalledTimes(1);
      expect(onPressedChange.mock.calls[0][0]).toBe(true);
      expect(onPressedChange.mock.calls[0][1].reason).toBe('none');
      expect(onPressedChange.mock.calls[0][1].event).toBeInstanceOf(Event);
    });

    it('prevents the state change when canceled', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => (
        <Toggle onPressedChange={(_, details) => details.cancel()} />
      ));
      const button = getByRole('button');
      await user.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('prop: disabled', () => {
    it('renders a natively disabled button and does not react to clicks', () => {
      const onPressedChange = vi.fn();
      const { getByRole } = render(() => (
        <Toggle disabled onPressedChange={onPressedChange} />
      ));
      const button = getByRole('button', { hidden: true }) as HTMLButtonElement;
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('data-disabled');
      button.click();
      expect(onPressedChange).not.toHaveBeenCalled();
    });
  });

  describe('keyboard interaction', () => {
    it('toggles on Enter and Space for native buttons', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => <Toggle />);
      const button = getByRole('button');

      button.focus();
      await user.keyboard('[Enter]');
      expect(button).toHaveAttribute('aria-pressed', 'true');

      await user.keyboard('[Space]');
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });

    it('toggles on Enter and Space for non-native buttons', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => (
        <Toggle nativeButton={false} as="span" />
      ));
      const button = getByRole('button');
      expect(button.tagName).toBe('SPAN');
      expect(button).toHaveAttribute('tabindex', '0');

      button.focus();
      await user.keyboard('[Enter]');
      expect(button).toHaveAttribute('aria-pressed', 'true');

      await user.keyboard('[Space]');
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('supports class as a function of state', async () => {
    const user = userEvent.setup();
    const { getByRole } = render(() => (
      <Toggle class={(state) => (state.pressed ? 'on' : 'off')} />
    ));
    const button = getByRole('button');
    expect(button).toHaveClass('off');
    await user.click(button);
    expect(button).toHaveClass('on');
  });

  it('exposes visual state to class functions', () => {
    const { getByRole } = render(() => (
      <Toggle
        label="Delete mode"
        variant="destructive"
        size="sm"
        class={(state) => `${state.variant}-${state.size}-${state.iconOnly}`}
      />
    ));
    expect(getByRole('button', { name: 'Delete mode' })).toHaveClass('destructive-sm-false');
  });
});
