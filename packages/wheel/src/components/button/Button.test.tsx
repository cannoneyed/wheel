// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

// Upstream also runs `describeConformance(<Button />, ...)`, a React/MUI-only
// test utility (ref instanceof checks, root class name, etc.) that has no
// Solid equivalent in this repo — behavior it exercises (rendering a native
// `<button>`, forwarding `class`/`ref`) is covered by the tests below and by
// `renderElement`'s own test suite.

describe('<Button />', () => {
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
