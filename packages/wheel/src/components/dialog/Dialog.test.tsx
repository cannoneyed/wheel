// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal, type JSX } from 'solid-js';
import { Dialog } from './index';
import { REASONS } from '../internals/reasons';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

interface TestDialogProps {
  rootProps?: Dialog.Root.Props;
  triggerProps?: Dialog.Trigger.Props;
  portalProps?: Dialog.Portal.Props;
  popupProps?: Dialog.Popup.Props;
  includeBackdrop?: boolean;
  omitTrigger?: boolean;
  children?: JSX.Element;
}

function TestDialog(props: TestDialogProps) {
  return (
    <Dialog.Root {...props.rootProps}>
      {!props.omitTrigger && (
        <Dialog.Trigger data-testid="trigger" {...props.triggerProps}>
          Open
        </Dialog.Trigger>
      )}
      <Dialog.Portal {...props.portalProps}>
        {props.includeBackdrop && (
          <Dialog.Backdrop data-testid="backdrop" style={{ position: 'fixed', inset: '0px' }} />
        )}
        <Dialog.Popup data-testid="popup" style={{ position: 'fixed' }} {...props.popupProps}>
          {props.popupProps?.children ?? props.children ?? (
            <div>
              <p>Dialog content</p>
              <Dialog.Close data-testid="close">Close</Dialog.Close>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

describe('<Dialog.Root />', () => {
  describe('open/close', () => {
    it('opens when the trigger is clicked and closes with the close button', () => {
      render(() => <TestDialog />);

      expect(screen.queryByRole('dialog')).toBe(null);

      fireEvent.click(screen.getByTestId('trigger'));
      expect(screen.getByRole('dialog')).not.toBe(null);

      fireEvent.click(screen.getByTestId('close'));
      expect(screen.queryByRole('dialog')).toBe(null);
    });

    it('opens when defaultOpen is true', () => {
      render(() => <TestDialog rootProps={{ defaultOpen: true }} />);
      expect(screen.getByRole('dialog')).not.toBe(null);
    });
  });

  describe('controlled', () => {
    it('is driven by the open prop and reports state via onOpenChange', () => {
      const handleChange = vi.fn();

      function Controlled() {
        const [open, setOpen] = createSignal(false);
        return (
          <TestDialog
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
      expect(screen.queryByRole('dialog')).toBe(null);

      fireEvent.click(screen.getByTestId('trigger'));
      expect(handleChange).toHaveBeenCalledWith(true);
      expect(screen.getByRole('dialog')).not.toBe(null);

      fireEvent.click(screen.getByTestId('close'));
      expect(handleChange).toHaveBeenCalledWith(false);
      expect(screen.queryByRole('dialog')).toBe(null);
    });

    describe('onOpenChange details', () => {
      it('reports the reason for trigger press and close press', () => {
        const handleOpenChange = vi.fn();
        render(() => <TestDialog rootProps={{ onOpenChange: handleOpenChange }} />);

        fireEvent.click(screen.getByTestId('trigger'));
        expect(handleOpenChange.mock.calls[0][1].reason).toBe(REASONS.triggerPress);

        fireEvent.click(screen.getByTestId('close'));
        expect(handleOpenChange.mock.calls[1][1].reason).toBe(REASONS.closePress);
      });

      it('reports the reason for an Escape key close', () => {
        const handleOpenChange = vi.fn();
        render(() => <TestDialog rootProps={{ defaultOpen: true, onOpenChange: handleOpenChange }} />);

        fireEvent.keyDown(document.body, { key: 'Escape' });

        expect(handleOpenChange.mock.calls[0][1].reason).toBe(REASONS.escapeKey);
      });

      it('reports the reason for an outside/backdrop press', () => {
        const handleOpenChange = vi.fn();
        render(() => (
          <TestDialog
            rootProps={{ defaultOpen: true, onOpenChange: handleOpenChange }}
            includeBackdrop
          />
        ));

        fireEvent.click(screen.getByTestId('backdrop'));

        expect(handleOpenChange.mock.calls[0][1].reason).toBe(REASONS.outsidePress);
      });

      it('cancel() prevents the dialog from opening', () => {
        render(() => (
          <TestDialog
            rootProps={{
              onOpenChange: (nextOpen, details) => {
                if (nextOpen) {
                  details.cancel();
                }
              },
            }}
          />
        ));

        fireEvent.click(screen.getByTestId('trigger'));
        expect(screen.queryByRole('dialog')).toBe(null);
      });

      it('cancel() prevents the dialog from closing', () => {
        render(() => (
          <TestDialog
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
        expect(screen.getByRole('dialog')).not.toBe(null);
      });
    });
  });

  describe('escape key dismissal', () => {
    it('closes the dialog when Escape is pressed', () => {
      render(() => <TestDialog rootProps={{ defaultOpen: true }} />);
      expect(screen.getByRole('dialog')).not.toBe(null);

      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBe(null);
    });
  });

  describe('backdrop / outside press dismissal', () => {
    it('closes a modal dialog when the internal backdrop is pressed', () => {
      const handleOpenChange = vi.fn();
      render(() => (
        <TestDialog rootProps={{ defaultOpen: true, onOpenChange: handleOpenChange, modal: true }} />
      ));

      const internalBackdrop = screen.getByRole('presentation', { hidden: true });

      fireEvent.mouseDown(internalBackdrop);
      expect(screen.queryByRole('dialog')).not.toBe(null);
      expect(handleOpenChange).not.toHaveBeenCalled();

      fireEvent.click(internalBackdrop);
      expect(handleOpenChange).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).toBe(null);
    });

    it('closes a non-modal dialog on outside press', () => {
      const handleOpenChange = vi.fn();
      render(() => (
        <div>
          <button type="button" data-testid="outside">
            outside
          </button>
          <TestDialog
            rootProps={{ defaultOpen: true, onOpenChange: handleOpenChange, modal: false }}
          />
        </div>
      ));

      fireEvent.click(screen.getByTestId('outside'));

      expect(handleOpenChange).toHaveBeenCalledTimes(1);
      expect(handleOpenChange.mock.calls[0][1].reason).toBe(REASONS.outsidePress);
    });

    describe('prop: disablePointerDismissal', () => {
      it('prevents outside-press dismissal when true', () => {
        const handleOpenChange = vi.fn();
        render(() => (
          <div>
            <button type="button" data-testid="outside">
              outside
            </button>
            <TestDialog
              rootProps={{
                defaultOpen: true,
                onOpenChange: handleOpenChange,
                modal: false,
                disablePointerDismissal: true,
              }}
            />
          </div>
        ));

        fireEvent.click(screen.getByTestId('outside'));

        expect(handleOpenChange).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).not.toBe(null);
      });
    });
  });

  describe('prop: modal', () => {
    it('renders an internal backdrop when true', () => {
      render(() => <TestDialog rootProps={{ defaultOpen: true, modal: true }} />);
      expect(screen.getByRole('presentation', { hidden: true })).not.toBe(null);
    });

    it('does not render an internal backdrop when false', () => {
      render(() => <TestDialog rootProps={{ defaultOpen: true, modal: false }} />);
      expect(screen.queryByRole('presentation')).toBe(null);
    });
  });

  describe('scroll lock', () => {
    it('locks scroll on the document while a modal dialog is open, unlocking on close', async () => {
      function Controlled() {
        const [open, setOpen] = createSignal(true);
        return (
          <div>
            <button type="button" data-testid="toggle" onClick={() => setOpen(!open())}>
              toggle
            </button>
            <TestDialog rootProps={{ open: open(), onOpenChange: setOpen, modal: true }} />
          </div>
        );
      }

      render(() => <Controlled />);

      await waitFor(() => {
        expect(document.documentElement).toHaveAttribute('data-base-ui-scroll-locked');
      });

      fireEvent.click(screen.getByTestId('toggle'));

      await waitFor(() => {
        expect(document.documentElement).not.toHaveAttribute('data-base-ui-scroll-locked');
      });
    });

    it('does not lock scroll for a non-modal dialog', async () => {
      render(() => <TestDialog rootProps={{ defaultOpen: true, modal: false }} />);

      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      expect(document.documentElement).not.toHaveAttribute('data-base-ui-scroll-locked');
    });
  });

  describe('nested dialogs', () => {
    it('marks a nested dialog popup with data-nested and reports nested-dialog-open on the parent', () => {
      function App() {
        const [nestedOpen, setNestedOpen] = createSignal(true);
        return (
          <Dialog.Root open modal={false}>
            <Dialog.Portal>
              <Dialog.Popup data-testid="outer-popup">
                Outer
                <Dialog.Root open={nestedOpen()} onOpenChange={setNestedOpen} modal={false}>
                  <Dialog.Portal>
                    <Dialog.Popup data-testid="inner-popup">Inner</Dialog.Popup>
                  </Dialog.Portal>
                </Dialog.Root>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        );
      }

      render(() => <App />);

      expect(screen.getByTestId('inner-popup')).toHaveAttribute('data-nested');
      expect(screen.getByTestId('outer-popup')).toHaveAttribute('data-nested-dialog-open');
    });

    it('dismisses nested modal dialogs one at a time via their own backdrop', async () => {
      function App() {
        const [level2Open, setLevel2Open] = createSignal(false);
        const [level3Open, setLevel3Open] = createSignal(false);

        return (
          <div>
            <TestDialog
              rootProps={{ modal: true }}
              triggerProps={{ 'data-testid': 'open-1' } as Dialog.Trigger.Props}
              popupProps={
                {
                  'data-testid': 'level-1',
                  children: (
                    <button type="button" onClick={() => setLevel2Open(true)}>
                      Open level 2
                    </button>
                  ),
                } as Dialog.Popup.Props
              }
            />
            <Dialog.Root open={level2Open()} onOpenChange={setLevel2Open} modal>
              <Dialog.Portal>
                <Dialog.Popup data-testid="level-2">
                  <button type="button" onClick={() => setLevel3Open(true)}>
                    Open level 3
                  </button>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
            <Dialog.Root open={level3Open()} onOpenChange={setLevel3Open} modal>
              <Dialog.Portal>
                <Dialog.Popup data-testid="level-3">Final nested</Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        );
      }

      render(() => <App />);

      fireEvent.click(screen.getByTestId('open-1'));
      fireEvent.click(screen.getByText('Open level 2'));
      fireEvent.click(screen.getByText('Open level 3'));

      const backdrops = () => Array.from(document.querySelectorAll('[role="presentation"]'));

      fireEvent.click(backdrops()[backdrops().length - 1]);
      await waitFor(() => {
        expect(screen.queryByTestId('level-3')).toBe(null);
      });

      fireEvent.click(backdrops()[backdrops().length - 1]);
      await waitFor(() => {
        expect(screen.queryByTestId('level-2')).toBe(null);
      });

      fireEvent.click(backdrops()[backdrops().length - 1]);
      await waitFor(() => {
        expect(screen.queryByTestId('level-1')).toBe(null);
      });
    });
  });

  describe('modal focus trap', () => {
    // `FloatingFocusManager`'s initial-focus and focus-guard wraparound use `enqueueFocus`, which
    // defers the actual `.focus()` call to a `requestAnimationFrame`. Mock it to run synchronously
    // so assertions don't need an extra frame to elapse (matches
    // `floating-ui-solid/components/FloatingFocusManager.test.tsx`).
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

    it('traps Tab/Shift+Tab focus within the popup and returns focus to the trigger on close', async () => {
      render(() => (
        <TestDialog
          popupProps={
            {
              children: (
                <div>
                  <button data-testid="one">one</button>
                  <button data-testid="two">two</button>
                  <Dialog.Close data-testid="close">Close</Dialog.Close>
                </div>
              ),
            } as Dialog.Popup.Props
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
      expect(screen.getByTestId('two')).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId('close')).toHaveFocus();

      // Tabbing forward from the last element wraps back to the first via the focus guard.
      await user.tab();
      expect(screen.getByTestId('one')).toHaveFocus();

      // Shift+Tab from the first element wraps back to the last.
      await user.tab({ shift: true });
      expect(screen.getByTestId('close')).toHaveFocus();

      fireEvent.click(screen.getByTestId('close'));

      await waitFor(() => {
        expect(trigger).toHaveFocus();
      });
    });

    it('respects an explicit initialFocus target', async () => {
      let secondButton: HTMLButtonElement | undefined;

      render(() => (
        <TestDialog
          popupProps={
            {
              initialFocus: () => secondButton ?? null,
              children: (
                <div>
                  <button data-testid="one">one</button>
                  <button data-testid="two" ref={(el) => (secondButton = el)}>
                    two
                  </button>
                </div>
              ),
            } as unknown as Dialog.Popup.Props
          }
        />
      ));

      fireEvent.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('two')).toHaveFocus();
      });
    });
  });

  describe('ARIA', () => {
    it('sets role="dialog" and wires up aria-labelledby/aria-describedby', () => {
      render(() => (
        <TestDialog
          rootProps={{ defaultOpen: true }}
          popupProps={
            {
              children: (
                <div>
                  <Dialog.Title>Title text</Dialog.Title>
                  <Dialog.Description>Description text</Dialog.Description>
                </div>
              ),
            } as Dialog.Popup.Props
          }
        />
      ));

      const popup = screen.getByRole('dialog');
      expect(popup).toHaveAttribute('role', 'dialog');
      expect(screen.getByText('Title text').getAttribute('id')).toBe(
        popup.getAttribute('aria-labelledby'),
      );
      expect(screen.getByText('Description text').getAttribute('id')).toBe(
        popup.getAttribute('aria-describedby'),
      );
    });

    it('wires the trigger to the popup with aria-haspopup/aria-controls/aria-expanded', () => {
      render(() => <TestDialog />);

      const trigger = screen.getByTestId('trigger');
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).not.toHaveAttribute('aria-controls');

      fireEvent.click(trigger);

      const popup = screen.getByRole('dialog');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(trigger.getAttribute('aria-controls')).toBe(popup.getAttribute('id'));
    });
  });

  describe('transition attributes', () => {
    it('sets data-starting-style while opening and removes it once mounted', async () => {
      function Controlled() {
        const [open, setOpen] = createSignal(false);
        return (
          <div>
            <button type="button" data-testid="open" onClick={() => setOpen(true)}>
              open
            </button>
            <TestDialog rootProps={{ open: open(), onOpenChange: setOpen }} />
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
    });

    it('sets data-ending-style while closing', async () => {
      function Controlled() {
        const [open, setOpen] = createSignal(true);
        return (
          <div>
            <button type="button" data-testid="close-external" onClick={() => setOpen(false)}>
              close
            </button>
            <TestDialog rootProps={{ open: open(), onOpenChange: setOpen }} />
          </div>
        );
      }

      render(() => <Controlled />);
      const popup = screen.getByTestId('popup');

      await waitFor(() => {
        expect(popup).not.toHaveAttribute('data-starting-style');
      });

      fireEvent.click(screen.getByTestId('close-external'));

      await waitFor(() => {
        expect(popup).toHaveAttribute('data-ending-style');
      });
    });
  });
});

describe('<Dialog.Portal />', () => {
  it('renders the popup content into document.body', () => {
    render(() => <TestDialog rootProps={{ defaultOpen: true }} />);
    const popup = screen.getByTestId('popup');
    expect(document.body.contains(popup)).toBe(true);
    expect(popup.closest('[data-base-ui-portal]')).not.toBe(null);
  });

  describe('prop: keepMounted', () => {
    it('keeps the popup mounted (hidden) while closed', () => {
      render(() => <TestDialog portalProps={{ keepMounted: true }} />);
      const popup = screen.getByTestId('popup');
      expect(popup).not.toBe(null);
      expect(popup).toHaveAttribute('hidden');
    });

    it('does not render the popup when closed and keepMounted is false', () => {
      render(() => <TestDialog />);
      expect(screen.queryByTestId('popup')).toBe(null);
    });
  });
});

describe('<Dialog.Backdrop />', () => {
  it('has role="presentation"', () => {
    render(() => <TestDialog rootProps={{ defaultOpen: true }} includeBackdrop />);
    expect(screen.getByTestId('backdrop')).toHaveAttribute('role', 'presentation');
  });

  it('does not render a nested backdrop by default', () => {
    render(() => (
      <Dialog.Root open modal={false}>
        <Dialog.Backdrop data-testid="root-backdrop" />
        <Dialog.Portal>
          <Dialog.Popup>
            <Dialog.Root open modal={false}>
              <Dialog.Backdrop data-testid="nested-backdrop" />
              <Dialog.Portal>
                <Dialog.Popup>Nested</Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    ));

    expect(screen.getByTestId('root-backdrop')).not.toBe(null);
    expect(screen.queryByTestId('nested-backdrop')).toBe(null);
  });

  it('renders a nested backdrop when forceRender is set', () => {
    render(() => (
      <Dialog.Root open modal={false}>
        <Dialog.Portal>
          <Dialog.Popup>
            <Dialog.Root open modal={false}>
              <Dialog.Backdrop data-testid="nested-backdrop" forceRender />
              <Dialog.Portal>
                <Dialog.Popup>Nested</Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    ));

    expect(screen.getByTestId('nested-backdrop')).not.toBe(null);
  });
});

describe('<Dialog.Viewport />', () => {
  it('renders only when the dialog is mounted by default', () => {
    function Controlled() {
      const [open, setOpen] = createSignal(false);
      return (
        <Dialog.Root open={open()} onOpenChange={setOpen} modal={false}>
          <Dialog.Trigger data-testid="trigger">Open</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Viewport data-testid="viewport">
              <Dialog.Popup data-testid="popup">Content</Dialog.Popup>
            </Dialog.Viewport>
          </Dialog.Portal>
        </Dialog.Root>
      );
    }

    render(() => <Controlled />);
    expect(screen.queryByTestId('viewport')).toBe(null);

    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('viewport')).not.toBe(null);
    expect(screen.getByTestId('viewport')).toContainElement(screen.getByTestId('popup'));
  });

  it('stays mounted with a keepMounted portal', () => {
    function Controlled() {
      const [open, setOpen] = createSignal(true);
      return (
        <div>
          <button type="button" data-testid="toggle" onClick={() => setOpen(!open())}>
            toggle
          </button>
          <Dialog.Root open={open()} onOpenChange={setOpen} modal={false}>
            <Dialog.Portal keepMounted>
              <Dialog.Viewport data-testid="viewport">
                <Dialog.Popup>Content</Dialog.Popup>
              </Dialog.Viewport>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      );
    }

    render(() => <Controlled />);
    expect(screen.getByTestId('viewport')).not.toBe(null);

    fireEvent.click(screen.getByTestId('toggle'));
    expect(screen.getByTestId('viewport')).not.toBe(null);
  });
});

describe('<Dialog.Title /> / <Dialog.Description />', () => {
  it('generates ids and wires them to the popup', () => {
    render(() => (
      <TestDialog
        rootProps={{ defaultOpen: true }}
        popupProps={
          {
            children: (
              <div>
                <Dialog.Title data-testid="title">Title</Dialog.Title>
                <Dialog.Description data-testid="description">Description</Dialog.Description>
              </div>
            ),
          } as Dialog.Popup.Props
        }
      />
    ));

    expect(screen.getByTestId('title')).toHaveAttribute('id');
    expect(screen.getByTestId('description')).toHaveAttribute('id');
  });
});

describe('<Dialog.Close />', () => {
  it('closes the dialog when clicked', () => {
    render(() => <TestDialog rootProps={{ defaultOpen: true }} />);
    fireEvent.click(screen.getByTestId('close'));
    expect(screen.queryByRole('dialog')).toBe(null);
  });

  it('applies data-disabled and does not close when disabled', () => {
    render(() => (
      <TestDialog
        rootProps={{ defaultOpen: true }}
        popupProps={
          {
            children: <Dialog.Close data-testid="close" disabled>Close</Dialog.Close>,
          } as Dialog.Popup.Props
        }
      />
    ));

    const close = screen.getByTestId('close');
    expect(close).toHaveAttribute('data-disabled');
    fireEvent.click(close);
    expect(screen.getByRole('dialog')).not.toBe(null);
  });
});
