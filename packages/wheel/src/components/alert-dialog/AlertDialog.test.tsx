// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal, type JSX } from 'solid-js';
import { AlertDialog } from './index';
import { REASONS } from '../internals/reasons';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

interface TestAlertDialogProps {
  rootProps?: AlertDialog.Root.Props;
  popupProps?: AlertDialog.Popup.Props;
  includeBackdrop?: boolean;
  children?: JSX.Element;
}

function TestAlertDialog(props: TestAlertDialogProps) {
  return (
    <AlertDialog.Root {...props.rootProps}>
      <AlertDialog.Trigger data-testid="trigger">Open</AlertDialog.Trigger>
      <AlertDialog.Portal>
        {props.includeBackdrop && (
          <AlertDialog.Backdrop data-testid="backdrop" style={{ position: 'fixed', inset: '0px' }} />
        )}
        <AlertDialog.Popup data-testid="popup" style={{ position: 'fixed' }} {...props.popupProps}>
          {props.popupProps?.children ?? props.children ?? (
            <div>
              <p>Alert dialog content</p>
              <AlertDialog.Close data-testid="close">Close</AlertDialog.Close>
            </div>
          )}
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

describe('<AlertDialog.Root />', () => {
  describe('open/close', () => {
    it('opens when the trigger is clicked and closes with the close button', () => {
      render(() => <TestAlertDialog />);

      expect(screen.queryByRole('alertdialog')).toBe(null);

      fireEvent.click(screen.getByTestId('trigger'));
      expect(screen.getByRole('alertdialog')).not.toBe(null);

      fireEvent.click(screen.getByTestId('close'));
      expect(screen.queryByRole('alertdialog')).toBe(null);
    });
  });

  describe('controlled + onOpenChange', () => {
    it('is driven by the open prop and reports state via onOpenChange', () => {
      const handleChange = vi.fn();

      function Controlled() {
        const [open, setOpen] = createSignal(false);
        return (
          <TestAlertDialog
            rootProps={{
              open: open(),
              onOpenChange: (nextOpen) => {
                handleChange(nextOpen);
                setOpen(nextOpen);
              },
            }}
          />
        );
      }

      render(() => <Controlled />);
      fireEvent.click(screen.getByTestId('trigger'));
      expect(handleChange).toHaveBeenCalledWith(true);
      expect(screen.getByRole('alertdialog')).not.toBe(null);

      fireEvent.click(screen.getByTestId('close'));
      expect(handleChange).toHaveBeenCalledWith(false);
      expect(screen.queryByRole('alertdialog')).toBe(null);
    });

    it('reports the reason for trigger press, close press, and Escape', () => {
      const handleOpenChange = vi.fn();
      render(() => <TestAlertDialog rootProps={{ onOpenChange: handleOpenChange }} />);

      fireEvent.click(screen.getByTestId('trigger'));
      expect(handleOpenChange.mock.calls[0][1].reason).toBe(REASONS.triggerPress);

      fireEvent.click(screen.getByTestId('close'));
      expect(handleOpenChange.mock.calls[1][1].reason).toBe(REASONS.closePress);

      fireEvent.click(screen.getByTestId('trigger'));
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(handleOpenChange.mock.calls[3][1].reason).toBe(REASONS.escapeKey);
    });

    it('cancel() prevents the alert dialog from closing', () => {
      render(() => (
        <TestAlertDialog
          rootProps={{
            defaultOpen: true,
            onOpenChange: (nextOpen, details) => {
              if (!nextOpen) {
                details.cancel();
              }
            },
          }}
        />
      ));

      fireEvent.click(screen.getByTestId('close'));
      expect(screen.getByRole('alertdialog')).not.toBe(null);
    });
  });

  describe('escape key dismissal', () => {
    it('closes the alert dialog when Escape is pressed (unlike backdrop press)', () => {
      const handleOpenChange = vi.fn();
      render(() => (
        <TestAlertDialog rootProps={{ defaultOpen: true, onOpenChange: handleOpenChange }} />
      ));

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(handleOpenChange).toHaveBeenCalledTimes(1);
      expect(handleOpenChange.mock.calls[0][1].reason).toBe(REASONS.escapeKey);
      expect(screen.queryByRole('alertdialog')).toBe(null);
    });
  });

  describe('backdrop press dismissal (disabled by default)', () => {
    it('does not close when the internal backdrop is pressed', () => {
      const handleOpenChange = vi.fn();
      render(() => (
        <TestAlertDialog rootProps={{ defaultOpen: true, onOpenChange: handleOpenChange }} />
      ));

      const internalBackdrop = screen.getByRole('presentation', { hidden: true });
      fireEvent.click(internalBackdrop);

      expect(handleOpenChange).not.toHaveBeenCalled();
      expect(screen.getByRole('alertdialog')).not.toBe(null);
    });

    it('is always modal, regardless of any modal prop passed through', () => {
      render(() => <TestAlertDialog rootProps={{ defaultOpen: true }} />);
      expect(screen.getByRole('presentation', { hidden: true })).not.toBe(null);
    });
  });

  describe('modal focus trap', () => {
    beforeEach(() => {
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
        (callback: FrameRequestCallback): number => {
          callback(0);
          return 0;
        },
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('traps Tab focus within the popup and returns focus to the trigger on close', async () => {
      render(() => (
        <TestAlertDialog
          popupProps={
            {
              children: (
                <div>
                  <button data-testid="one">one</button>
                  <AlertDialog.Close data-testid="close">Close</AlertDialog.Close>
                </div>
              ),
            } as AlertDialog.Popup.Props
          }
        />
      ));

      const trigger = screen.getByTestId('trigger');
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByTestId('one')).toHaveFocus();
      });

      const user = userEvent.setup();
      await user.tab();
      expect(screen.getByTestId('close')).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId('one')).toHaveFocus();

      fireEvent.click(screen.getByTestId('close'));
      await waitFor(() => {
        expect(trigger).toHaveFocus();
      });
    });
  });

  describe('ARIA', () => {
    it('sets role="alertdialog" and wires up aria-labelledby/aria-describedby', () => {
      render(() => (
        <TestAlertDialog
          rootProps={{ defaultOpen: true }}
          popupProps={
            {
              children: (
                <div>
                  <AlertDialog.Title>Title text</AlertDialog.Title>
                  <AlertDialog.Description>Description text</AlertDialog.Description>
                </div>
              ),
            } as AlertDialog.Popup.Props
          }
        />
      ));

      const popup = screen.getByRole('alertdialog');
      expect(screen.getByText('Title text').getAttribute('id')).toBe(
        popup.getAttribute('aria-labelledby'),
      );
      expect(screen.getByText('Description text').getAttribute('id')).toBe(
        popup.getAttribute('aria-describedby'),
      );
    });

    it('wires the trigger with aria-haspopup="dialog"', () => {
      render(() => <TestAlertDialog />);
      expect(screen.getByTestId('trigger')).toHaveAttribute('aria-haspopup', 'dialog');
    });
  });

  describe('keepMounted', () => {
    it('keeps the popup mounted (hidden) while closed', () => {
      render(() => (
        <AlertDialog.Root>
          <AlertDialog.Portal keepMounted>
            <AlertDialog.Popup data-testid="popup">Content</AlertDialog.Popup>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      ));

      const popup = screen.getByTestId('popup');
      expect(popup).not.toBe(null);
      expect(popup).toHaveAttribute('hidden');
    });
  });

  describe('transition attributes', () => {
    it('sets data-starting-style while opening and data-ending-style while closing', async () => {
      function Controlled() {
        const [open, setOpen] = createSignal(false);
        return (
          <div>
            <button type="button" data-testid="open" onClick={() => setOpen(true)}>
              open
            </button>
            <button type="button" data-testid="close-external" onClick={() => setOpen(false)}>
              close
            </button>
            <TestAlertDialog rootProps={{ open: open(), onOpenChange: setOpen }} />
          </div>
        );
      }

      render(() => <Controlled />);
      fireEvent.click(screen.getByTestId('open'));

      const popup = screen.getByTestId('popup');
      expect(popup).toHaveAttribute('data-starting-style');

      await waitFor(() => {
        expect(popup).not.toHaveAttribute('data-starting-style');
      });

      fireEvent.click(screen.getByTestId('close-external'));

      await waitFor(() => {
        expect(popup).toHaveAttribute('data-ending-style');
      });
    });
  });

  describe('renders a viewport', () => {
    it('contains the popup inside the viewport element', () => {
      render(() => (
        <AlertDialog.Root open>
          <AlertDialog.Portal>
            <AlertDialog.Viewport data-testid="viewport">
              <AlertDialog.Popup>Dialog</AlertDialog.Popup>
            </AlertDialog.Viewport>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      ));

      expect(screen.getByTestId('viewport')).toContainElement(screen.getByRole('alertdialog'));
    });
  });
});
