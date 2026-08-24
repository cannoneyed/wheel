// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { AlertDialog } from '../../alert-dialog';
import { Dialog } from '../../dialog';
import { Drawer } from '../index';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

describe('<Drawer.Popup />', () => {
  it('warns in development when not rendered within a viewport', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(() => (
      <Drawer.Root open>
        <Drawer.Portal>
          <Drawer.Popup>Drawer</Drawer.Popup>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '<Drawer.Popup> expected to be rendered within <Drawer.Viewport>.',
        ),
      );
    });

    consoleErrorSpy.mockRestore();
  });

  it('defaults initial focus to the popup element', async () => {
    render(() => (
      <div>
        <input />
        <Drawer.Root modal={false}>
          <Drawer.Trigger>Open</Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Viewport>
              <Drawer.Popup data-testid="popup">
                <input data-testid="popup-input" />
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() => {
      expect(screen.getByTestId('popup')).toHaveFocus();
    });
    expect(screen.getByTestId('popup-input')).not.toHaveFocus();
  });

  it('does not treat dialogs inside nested drawers as nested drawers', async () => {
    render(() => (
      <Drawer.Root open modal={false}>
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="parent-popup">
              <Drawer.Root open modal={false}>
                <Drawer.Portal>
                  <Drawer.Viewport>
                    <Drawer.Popup data-testid="child-popup">
                      <Dialog.Root modal={false}>
                        <Dialog.Trigger>Open dialog</Dialog.Trigger>
                        <Dialog.Portal>
                          <Dialog.Popup data-testid="dialog-popup">Dialog</Dialog.Popup>
                        </Dialog.Portal>
                      </Dialog.Root>
                    </Drawer.Popup>
                  </Drawer.Viewport>
                </Drawer.Portal>
              </Drawer.Root>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const parentPopup = screen.getByTestId('parent-popup');
    const childPopup = screen.getByTestId('child-popup');

    expect(parentPopup.style.getPropertyValue('--nested-drawers')).toBe('1');
    expect(childPopup.style.getPropertyValue('--nested-drawers')).toBe('0');
    expect(childPopup).not.toHaveAttribute('data-nested-drawer-open');

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    await waitFor(() => {
      expect(screen.getByTestId('dialog-popup')).toBeVisible();
    });
    expect(parentPopup.style.getPropertyValue('--nested-drawers')).toBe('1');
    expect(childPopup.style.getPropertyValue('--nested-drawers')).toBe('0');
    expect(childPopup).not.toHaveAttribute('data-nested-drawer-open');
  });

  it('does not treat alert dialogs inside nested drawers as nested drawers', async () => {
    render(() => (
      <Drawer.Root open modal={false}>
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="parent-popup">
              <Drawer.Root open modal={false}>
                <Drawer.Portal>
                  <Drawer.Viewport>
                    <Drawer.Popup data-testid="child-popup">
                      <AlertDialog.Root>
                        <AlertDialog.Trigger>Open alert dialog</AlertDialog.Trigger>
                        <AlertDialog.Portal>
                          <AlertDialog.Popup data-testid="alert-dialog-popup">
                            Alert dialog
                            <AlertDialog.Close>Close alert dialog</AlertDialog.Close>
                          </AlertDialog.Popup>
                        </AlertDialog.Portal>
                      </AlertDialog.Root>
                    </Drawer.Popup>
                  </Drawer.Viewport>
                </Drawer.Portal>
              </Drawer.Root>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const parentPopup = screen.getByTestId('parent-popup');
    const childPopup = screen.getByTestId('child-popup');

    expect(parentPopup.style.getPropertyValue('--nested-drawers')).toBe('1');
    expect(childPopup.style.getPropertyValue('--nested-drawers')).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: 'Open alert dialog' }));

    await waitFor(() => {
      expect(screen.getByTestId('alert-dialog-popup')).toBeVisible();
    });
    expect(parentPopup.style.getPropertyValue('--nested-drawers')).toBe('1');
    expect(childPopup.style.getPropertyValue('--nested-drawers')).toBe('0');
    expect(childPopup).not.toHaveAttribute('data-nested-drawer-open');
  });

  it('clears parent nested drawer state as soon as a nested drawer closes', async () => {
    render(() => (
      <Drawer.Root open modal={false}>
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="parent-popup">
              <Drawer.Root modal={false}>
                <Drawer.Trigger>Open nested drawer</Drawer.Trigger>
                <Drawer.Portal keepMounted>
                  <Drawer.Viewport>
                    <Drawer.Popup data-testid="child-popup">
                      <Drawer.Close>Close nested drawer</Drawer.Close>
                    </Drawer.Popup>
                  </Drawer.Viewport>
                </Drawer.Portal>
              </Drawer.Root>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const parentPopup = screen.getByTestId('parent-popup');
    const childPopup = screen.getByTestId('child-popup');

    expect(parentPopup.style.getPropertyValue('--nested-drawers')).toBe('0');
    expect(parentPopup).not.toHaveAttribute('data-nested-drawer-open');

    fireEvent.click(screen.getByRole('button', { name: 'Open nested drawer' }));

    await waitFor(() => {
      expect(parentPopup.style.getPropertyValue('--nested-drawers')).toBe('1');
    });
    expect(parentPopup).toHaveAttribute('data-nested-drawer-open', '');

    fireEvent.click(screen.getByRole('button', { name: 'Close nested drawer' }));

    expect(childPopup).toBeInTheDocument();
    expect(parentPopup.style.getPropertyValue('--nested-drawers')).toBe('0');
    expect(parentPopup).not.toHaveAttribute('data-nested-drawer-open');
  });

  // The remaining upstream cases (border-size in `--drawer-frontmost-height`, exit-animation
  // timing for `--nested-drawers`/`data-nested-drawer-open`, and fixed-height-during-close
  // regressions) are gated `it.skipIf(isJSDOM)` upstream — they depend on real layout
  // (`offsetHeight`/CSS animations) that jsdom doesn't provide, so they are not ported.
});
