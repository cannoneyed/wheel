// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { IconButton } from './IconButton';

describe('<IconButton />', () => {
  it('renders one hidden icon with a required accessible label', () => {
    const { getByRole, getByTestId } = render(() => (
      <IconButton label="Delete message" icon={<svg data-testid="icon" />} />
    ));
    const button = getByRole('button', { name: 'Delete message' });

    expect(button).toHaveClass('wheel-IconButton');
    expect(button).toHaveAttribute('data-slot', 'icon-button');
    expect(button).toHaveAttribute('data-icon-only');
    expect(getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('shares Button variants, sizes, loading, and action behavior', async () => {
    const user = userEvent.setup();
    const clickAction = vi.fn();
    const { getByRole } = render(() => (
      <IconButton
        label="Delete message"
        icon={<svg />}
        variant="destructive"
        size="sm"
        clickAction={clickAction}
      />
    ));
    const button = getByRole('button', { name: 'Delete message' });

    expect(button).toHaveAttribute('data-variant', 'destructive');
    expect(button).toHaveAttribute('data-size', 'sm');
    await user.click(button);
    expect(clickAction).toHaveBeenCalledTimes(1);
  });

  it('renders as a labeled link', () => {
    const { getByRole } = render(() => (
      <IconButton label="Open settings" icon={<svg />} href="/settings" />
    ));
    expect(getByRole('link', { name: 'Open settings' })).toHaveAttribute('href', '/settings');
  });

  it('keeps its name and state contract while loading', () => {
    const { getByRole } = render(() => (
      <IconButton label="Save changes" icon={<svg />} loading />
    ));
    const button = getByRole('button', { name: /Save changes/ });

    expect(button).toHaveAttribute('data-loading');
    expect(button).toHaveAttribute('data-icon-only');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });
});
