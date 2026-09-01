// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { Button } from './Button';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(cleanup);

// Upstream also runs `describeConformance(<Button />, ...)`, a React/MUI-only
// test utility (ref instanceof checks, root class name, etc.) that has no
// Solid equivalent in this repo — behavior it exercises (rendering a native
// `<button>`, forwarding `class`/`ref`) is covered by the tests below and by
// `renderElement`'s own test suite.

describe('<Button />', () => {
  it('exposes the default identity, variant, size, and native type', () => {
    const { getByRole } = render(() => <Button>Save</Button>);
    const button = getByRole('button', { name: 'Save' });

    expect(button).toHaveClass('wheel-Button');
    expect(button).toHaveAttribute('data-slot', 'button');
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'md');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('renders variants, sizes, leading icons, and trailing content', () => {
    const { getByRole, getByTestId } = render(() => (
      <Button
        variant="destructive"
        size="lg"
        icon={<svg data-testid="leading" />}
        endContent={<span data-testid="trailing">3</span>}
      >
        Delete
      </Button>
    ));
    const button = getByRole('button', { name: 'Delete' });

    expect(button).toHaveAttribute('data-variant', 'destructive');
    expect(button).toHaveAttribute('data-size', 'lg');
    expect(getByTestId('leading')).toBeInTheDocument();
    expect(getByTestId('trailing')).toBeInTheDocument();
  });

  it('renders href as a native link, forwards link attributes, and removes navigation when disabled', () => {
    const [disabled, setDisabled] = createSignal(false);
    const { getByRole } = render(() => (
      <Button
        href="/settings"
        target="_blank"
        rel="noreferrer"
        download="settings.json"
        disabled={disabled()}
      >
        Settings
      </Button>
    ));

    const link = getByRole('link', { name: 'Settings' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/settings');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(link).toHaveAttribute('download', 'settings.json');

    setDisabled(true);
    expect(link).not.toHaveAttribute('href');
    expect(link).toHaveAttribute('aria-disabled', 'true');
  });

  it('forwards explicit submit and reset types', () => {
    const { getAllByRole } = render(() => (
      <>
        <Button type="submit">Submit</Button>
        <Button type="reset">Reset</Button>
      </>
    ));
    const [submit, reset] = getAllByRole('button');

    expect(submit).toHaveAttribute('type', 'submit');
    expect(reset).toHaveAttribute('type', 'reset');
  });

  it('lets onClick prevent clickAction', async () => {
    const user = userEvent.setup();
    const clickAction = vi.fn();
    const { getByRole } = render(() => (
      <Button onClick={(event) => event.preventDefault()} clickAction={clickAction}>
        Save
      </Button>
    ));

    await user.click(getByRole('button', { name: 'Save' }));
    expect(clickAction).not.toHaveBeenCalled();
  });

  it('shows pending state and deduplicates a non-interruptible action', async () => {
    const user = userEvent.setup();
    const action = deferred();
    const clickAction = vi.fn(() => action.promise);
    const { getByRole } = render(() => <Button clickAction={clickAction}>Save</Button>);
    const button = getByRole('button', { name: /Save/ });

    await user.click(button);
    expect(button).toHaveAttribute('data-loading');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    button.click();
    expect(clickAction).toHaveBeenCalledTimes(1);

    action.resolve();
    await action.promise;
    await Promise.resolve();
    expect(button).not.toHaveAttribute('data-loading');
    expect(button).not.toBeDisabled();
  });

  it('lets the newest interruptible action own pending state', async () => {
    const user = userEvent.setup();
    const first = deferred();
    const second = deferred();
    const clickAction = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { getByRole } = render(() => (
      <Button interruptible clickAction={clickAction}>
        Refresh
      </Button>
    ));
    const button = getByRole('button', { name: /Refresh/ });

    await user.click(button);
    await user.click(button);
    expect(clickAction).toHaveBeenCalledTimes(2);
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('data-loading');

    first.resolve();
    await first.promise;
    await Promise.resolve();
    expect(button).toHaveAttribute('data-loading');

    second.resolve();
    await second.promise;
    await Promise.resolve();
    expect(button).not.toHaveAttribute('data-loading');
  });

  it('clears pending state when an action rejects', async () => {
    const user = userEvent.setup();
    let rejectAction!: (error: Error) => void;
    const action = new Promise<void>((_, reject) => {
      rejectAction = reject;
    });
    const handledAction = action.catch(() => undefined);
    const { getByRole } = render(() => (
      <Button clickAction={() => action}>Save</Button>
    ));
    const button = getByRole('button', { name: /Save/ });

    await user.click(button);
    expect(button).toHaveAttribute('data-loading');

    rejectAction(new Error('save failed'));
    await handledAction;
    await Promise.resolve();
    expect(button).not.toHaveAttribute('data-loading');
  });

  it('exposes resolved state to class functions', () => {
    const { getByRole } = render(() => (
      <Button variant="primary" size="sm" loading class={(state) => `${state.variant}-${state.size}-${state.loading}`}>
        Save
      </Button>
    ));
    expect(getByRole('button', { name: /Save/ })).toHaveClass('primary-sm-true');
  });

  describe('prop: disabled', () => {
    it('native button: uses the disabled attribute and is not focusable', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const handleMouseDown = vi.fn();
      const handlePointerDown = vi.fn();
      const handleKeyDown = vi.fn();

      const { getByRole } = render(() => (
        <Button
          disabled
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
        />
      ));

      const button = getByRole('button', { hidden: true });

      expect(button).toHaveAttribute('disabled');
      expect(button).toHaveAttribute('data-disabled');
      expect(button).not.toHaveAttribute('aria-disabled');

      await user.tab();
      expect(button).not.toHaveFocus();

      await user.click(button);
      expect(handleClick).not.toHaveBeenCalled();
      expect(handleMouseDown).not.toHaveBeenCalled();
      expect(handlePointerDown).not.toHaveBeenCalled();
      expect(handleKeyDown).not.toHaveBeenCalled();
    });

    it('custom element: applies aria-disabled and is not focusable', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const handleMouseDown = vi.fn();
      const handlePointerDown = vi.fn();
      const handleKeyDown = vi.fn();

      const { getByRole } = render(() => (
        <Button
          disabled
          nativeButton={false}
          as="span"
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
        />
      ));

      const button = getByRole('button');

      expect(button).not.toHaveAttribute('disabled');
      expect(button).toHaveAttribute('data-disabled');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('tabindex', '-1');

      await user.tab();
      expect(button).not.toHaveFocus();

      await user.click(button);
      expect(handleClick).not.toHaveBeenCalled();
      expect(handleMouseDown).not.toHaveBeenCalled();
      expect(handlePointerDown).not.toHaveBeenCalled();
      expect(handleKeyDown).not.toHaveBeenCalled();
    });
  });

  describe('prop: focusableWhenDisabled', () => {
    it('native button: prevents interactions but remains focusable', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const handleMouseDown = vi.fn();
      const handlePointerDown = vi.fn();
      const handleKeyDown = vi.fn();

      const { getByRole } = render(() => (
        <Button
          disabled
          focusableWhenDisabled
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
        />
      ));

      const button = getByRole('button');

      expect(button).not.toHaveAttribute('disabled');
      expect(button).toHaveAttribute('data-disabled');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('tabindex', '0');

      await user.tab();
      expect(button).toHaveFocus();

      await user.click(button);
      expect(handleClick).not.toHaveBeenCalled();
      expect(handleMouseDown).not.toHaveBeenCalled();
      expect(handlePointerDown).not.toHaveBeenCalled();
      expect(handleKeyDown).not.toHaveBeenCalled();
    });

    // Upstream skips this under jsdom (`it.skipIf(isJSDOM)`) because hover
    // simulation needs a real browser; this suite only runs under jsdom, so
    // it is skipped here for the same reason rather than ported.
    it.skip('native button: allows hover handlers while blocking activation (browser-only)', () => {});

    it('custom element: prevents interactions but remains focusable', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const handleMouseDown = vi.fn();
      const handlePointerDown = vi.fn();
      const handleKeyDown = vi.fn();

      const { getByRole } = render(() => (
        <Button
          disabled
          focusableWhenDisabled
          nativeButton={false}
          as="span"
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
        />
      ));

      const button = getByRole('button');

      expect(button).not.toHaveAttribute('disabled');
      expect(button).toHaveAttribute('data-disabled');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('tabindex', '0');

      await user.tab();
      expect(button).toHaveFocus();

      await user.click(button);
      expect(handleClick).not.toHaveBeenCalled();
      expect(handleMouseDown).not.toHaveBeenCalled();
      expect(handlePointerDown).not.toHaveBeenCalled();
      expect(handleKeyDown).not.toHaveBeenCalled();
    });
  });
});
