// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { Button } from '../button/Button';
import { IconButton } from '../icon-button/IconButton';
import { DirectionProvider } from '../direction-provider';
import { ButtonGroup } from './ButtonGroup';

function flushMicrotasks() {
  return Promise.resolve();
}

describe('<ButtonGroup />', () => {
  it('renders a named group with stable state attributes', () => {
    const { getByRole } = render(() => (
      <ButtonGroup aria-label="Message actions" size="sm" variant="primary">
        <Button>Reply</Button>
      </ButtonGroup>
    ));
    const group = getByRole('group', { name: 'Message actions' });

    expect(group).toHaveClass('wheel-ButtonGroup');
    expect(group).toHaveAttribute('data-slot', 'button-group');
    expect(group).toHaveAttribute('data-orientation', 'horizontal');
    expect(group).toHaveAttribute('data-size', 'sm');
    expect(group).toHaveAttribute('data-variant', 'primary');
  });

  it('passes size, variant, and disabled state to Button and IconButton members', () => {
    const { getAllByRole } = render(() => (
      <ButtonGroup aria-label="Actions" size="lg" variant="destructive" disabled>
        <Button>Delete</Button>
        <IconButton label="More delete options" icon={<svg />} />
      </ButtonGroup>
    ));

    for (const button of getAllByRole('button', { hidden: true })) {
      expect(button).toHaveAttribute('data-size', 'lg');
      expect(button).toHaveAttribute('data-variant', 'destructive');
      expect(button).toHaveAttribute('data-disabled');
      expect(button).toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('lets a member override group size and variant', () => {
    const { getAllByRole } = render(() => (
      <ButtonGroup aria-label="Actions" size="lg" variant="primary">
        <Button>Inherited</Button>
        <Button size="sm" variant="ghost">Override</Button>
      </ButtonGroup>
    ));
    const [inherited, override] = getAllByRole('button');

    expect(inherited).toHaveAttribute('data-size', 'lg');
    expect(inherited).toHaveAttribute('data-variant', 'primary');
    expect(override).toHaveAttribute('data-size', 'sm');
    expect(override).toHaveAttribute('data-variant', 'ghost');
  });

  it('roves focus with arrows, Home, and End without activating members', async () => {
    const firstClick = vi.fn();
    const { getAllByRole } = render(() => (
      <ButtonGroup aria-label="Actions">
        <Button onClick={firstClick}>One</Button>
        <Button disabled>Two</Button>
        <Button>Three</Button>
      </ButtonGroup>
    ));
    const [first, , third] = getAllByRole('button', { hidden: true });

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await flushMicrotasks();
    expect(third).toHaveFocus();
    expect(firstClick).not.toHaveBeenCalled();

    third.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await flushMicrotasks();
    expect(first).toHaveFocus();

    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await flushMicrotasks();
    expect(third).toHaveFocus();
  });

  it('uses vertical arrows and supports non-looping focus', async () => {
    const { getAllByRole } = render(() => (
      <ButtonGroup aria-label="Actions" orientation="vertical" loopFocus={false}>
        <Button>One</Button>
        <Button>Two</Button>
      </ButtonGroup>
    ));
    const [first, second] = getAllByRole('button');

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await flushMicrotasks();
    expect(second).toHaveFocus();

    second.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await flushMicrotasks();
    expect(second).toHaveFocus();
  });

  it('reverses horizontal arrows in right-to-left direction', async () => {
    const { getAllByRole } = render(() => (
      <DirectionProvider direction="rtl">
        <ButtonGroup aria-label="Actions">
          <Button>One</Button>
          <Button>Two</Button>
        </ButtonGroup>
      </DirectionProvider>
    ));
    const [first, second] = getAllByRole('button');

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await flushMicrotasks();
    expect(second).toHaveFocus();
  });

  it('activates the focused member with Space', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    const { getByRole } = render(() => (
      <ButtonGroup aria-label="Actions">
        <Button onClick={handleClick}>Run</Button>
      </ButtonGroup>
    ));
    const button = getByRole('button', { name: 'Run' });
    button.focus();

    await user.keyboard('[Space]');
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('keeps native links in the roving focus order', async () => {
    const { getAllByRole } = render(() => (
      <ButtonGroup aria-label="Navigation">
        <Button href="#previous">Previous</Button>
        <Button href="#next">Next</Button>
      </ButtonGroup>
    ));
    const [previous, next] = getAllByRole('link');

    expect(previous).toHaveAttribute('tabindex', '0');
    expect(next).toHaveAttribute('tabindex', '-1');
    previous.focus();
    previous.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await flushMicrotasks();
    expect(next).toHaveFocus();
  });
});
