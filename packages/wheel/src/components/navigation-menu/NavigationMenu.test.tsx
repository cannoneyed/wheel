// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { NavigationMenu } from './index';
import { DirectionProvider } from '../direction-provider/DirectionProvider';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

function TestNavigationMenu(props: { rootProps?: NavigationMenu.Root.Props } = {}) {
  return (
    <NavigationMenu.Root {...props.rootProps}>
      <NavigationMenu.List>
        <NavigationMenu.Item value="item-1">
          <NavigationMenu.Trigger data-testid="trigger-1">Item 1</NavigationMenu.Trigger>
          <NavigationMenu.Content data-testid="popup-1">
            <NavigationMenu.Link href="#link-1">Link 1</NavigationMenu.Link>
            <NavigationMenu.Link href="#link-2">Link 2</NavigationMenu.Link>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        <NavigationMenu.Item value="item-2">
          <NavigationMenu.Trigger data-testid="trigger-2">Item 2</NavigationMenu.Trigger>
          <NavigationMenu.Content data-testid="popup-2">
            <NavigationMenu.Link href="#link-3">Link 3</NavigationMenu.Link>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner data-testid="positioner">
          <NavigationMenu.Popup data-testid="popup-root">
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

function TestNavigationMenuWithDisabledTrigger() {
  return (
    <NavigationMenu.Root>
      <NavigationMenu.List>
        <NavigationMenu.Item value="item-1">
          <NavigationMenu.Trigger data-testid="trigger-1" disabled>
            Item 1
          </NavigationMenu.Trigger>
          <NavigationMenu.Content data-testid="popup-1">
            <NavigationMenu.Link href="#link-1">Link 1</NavigationMenu.Link>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner>
          <NavigationMenu.Popup>
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

function TestInlineNestedNavigationMenu(props: { nestedLinkCloseOnClick?: boolean } = {}) {
  return (
    <NavigationMenu.Root>
      <NavigationMenu.List>
        <NavigationMenu.Item value="item-1">
          <NavigationMenu.Trigger data-testid="trigger-1">Item 1</NavigationMenu.Trigger>

          <NavigationMenu.Content data-testid="popup-1">
            <NavigationMenu.Link href="#link-1">Link 1</NavigationMenu.Link>
            <NavigationMenu.Root defaultValue="nested-item-1">
              <NavigationMenu.List data-testid="inline-nested-list">
                <NavigationMenu.Item value="nested-item-1">
                  <NavigationMenu.Trigger data-testid="nested-trigger-1">
                    Nested Item 1
                  </NavigationMenu.Trigger>
                  <NavigationMenu.Content data-testid="nested-popup-1">
                    <NavigationMenu.Link
                      href="#nested-link-1"
                      closeOnClick={props.nestedLinkCloseOnClick ?? false}
                      data-testid="nested-link-1"
                    >
                      Nested Link 1
                    </NavigationMenu.Link>
                  </NavigationMenu.Content>
                </NavigationMenu.Item>
                <NavigationMenu.Item value="nested-item-2">
                  <NavigationMenu.Trigger data-testid="nested-trigger-2">
                    Nested Item 2
                  </NavigationMenu.Trigger>
                  <NavigationMenu.Content data-testid="nested-popup-2">
                    <NavigationMenu.Link href="#nested-link-2">Nested Link 2</NavigationMenu.Link>
                  </NavigationMenu.Content>
                </NavigationMenu.Item>
              </NavigationMenu.List>

              <NavigationMenu.Viewport data-testid="inline-nested-viewport" />
            </NavigationMenu.Root>
          </NavigationMenu.Content>
        </NavigationMenu.Item>

        <NavigationMenu.Item value="item-2">
          <NavigationMenu.Trigger data-testid="trigger-2">Item 2</NavigationMenu.Trigger>
          <NavigationMenu.Content data-testid="popup-2">
            <NavigationMenu.Link href="#link-3">Link 3</NavigationMenu.Link>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner data-testid="positioner">
          <NavigationMenu.Popup data-testid="popup-root">
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

describe('<NavigationMenu.Root />', () => {
  it('does not apply aria-orientation to the top-level list or root element', () => {
    render(() => (
      <NavigationMenu.Root data-testid="top-level-root" orientation="vertical">
        <NavigationMenu.List data-testid="top-level-list">
          <NavigationMenu.Item value="item-1">
            <NavigationMenu.Trigger>Item 1</NavigationMenu.Trigger>
            <NavigationMenu.Content>
              <NavigationMenu.Link href="#">Link</NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        </NavigationMenu.List>
        <NavigationMenu.Portal>
          <NavigationMenu.Positioner>
            <NavigationMenu.Popup>
              <NavigationMenu.Viewport />
            </NavigationMenu.Popup>
          </NavigationMenu.Positioner>
        </NavigationMenu.Portal>
      </NavigationMenu.Root>
    ));

    expect(screen.getByTestId('top-level-root')).not.toHaveAttribute('aria-orientation');
    expect(screen.getByTestId('top-level-list')).not.toHaveAttribute('aria-orientation');
  });

  describe('interactions', () => {
    it('opens on hover with mouse input', async () => {
      render(() => <TestNavigationMenu />);
      const trigger = screen.getByTestId('trigger-1');

      fireEvent.mouseEnter(trigger);
      fireEvent.mouseMove(trigger);

      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).not.toBe(null);
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('opens on click with mouse input', async () => {
      render(() => <TestNavigationMenu />);
      const trigger = screen.getByTestId('trigger-1');

      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).not.toBe(null);
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('does not open on hover with touch input', async () => {
      render(() => <TestNavigationMenu />);
      const trigger = screen.getByTestId('trigger-1');

      fireEvent.pointerEnter(trigger, { pointerType: 'touch' });

      // Give any pending (incorrect) open a chance to happen before asserting it didn't.
      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });

      expect(screen.queryByTestId('popup-1')).toBe(null);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens on click with touch input', async () => {
      render(() => <TestNavigationMenu />);
      const trigger = screen.getByTestId('trigger-1');

      fireEvent.pointerDown(trigger, { pointerType: 'touch' });
      fireEvent.pointerUp(trigger, { pointerType: 'touch' });
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).not.toBe(null);
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('does not close menu when clicking a different trigger with mouse', async () => {
      render(() => <TestNavigationMenu />);
      const trigger1 = screen.getByTestId('trigger-1');
      const trigger2 = screen.getByTestId('trigger-2');

      fireEvent.click(trigger1);
      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).not.toBe(null);
      });
      expect(trigger1).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(trigger2);
      await waitFor(() => {
        expect(screen.queryByTestId('popup-2')).not.toBe(null);
      });
      expect(trigger1).toHaveAttribute('aria-expanded', 'false');
      expect(trigger2).toHaveAttribute('aria-expanded', 'true');
      expect(screen.queryByTestId('popup-1')).toBe(null);
    });

    it('returns focus to trigger when closing menu', async () => {
      const user = userEvent.setup();
      render(() => (
        <div>
          <button type="button" data-testid="first" />
          <TestNavigationMenu />
          <button type="button" data-testid="last" />
        </div>
      ));

      const trigger = screen.getByTestId('trigger-1');

      await user.click(trigger);
      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).not.toBe(null);
      });
      expect(trigger).toHaveFocus();

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).toBe(null);
      });
      await waitFor(() => {
        expect(trigger).toHaveFocus();
      });
    });
  });

  describe('prop: defaultValue', () => {
    it('should respect defaultValue', async () => {
      render(() => <TestNavigationMenu rootProps={{ defaultValue: 'item-1' }} />);

      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).not.toBe(null);
      });
      expect(screen.getByTestId('trigger-1')).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('prop: onValueChange', () => {
    it('should call onValueChange when value changes', async () => {
      const onValueChange = vi.fn();
      render(() => <TestNavigationMenu rootProps={{ onValueChange }} />);
      const trigger = screen.getByTestId('trigger-1');

      fireEvent.click(trigger);

      await waitFor(() => {
        expect(onValueChange).toHaveBeenCalledWith(
          'item-1',
          expect.objectContaining({ reason: expect.any(String) }),
        );
      });
    });

    it('should be controlled by value prop', async () => {
      function ControlledNavigationMenu() {
        const [value, setValue] = createSignal<string | null>(null);
        return (
          <div>
            <button
              type="button"
              data-testid="external-toggle"
              onClick={() => setValue((v) => (v === 'item-1' ? null : 'item-1'))}
            >
              external
            </button>
            <TestNavigationMenu rootProps={{ value: value() }} />
          </div>
        );
      }

      render(() => <ControlledNavigationMenu />);
      expect(screen.queryByTestId('popup-1')).toBe(null);

      fireEvent.click(screen.getByTestId('external-toggle'));
      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).not.toBe(null);
      });

      fireEvent.click(screen.getByTestId('external-toggle'));
      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).toBe(null);
      });
    });
  });

  describe('prop: delay', () => {
    it('respects custom delay value', async () => {
      render(() => <TestNavigationMenu rootProps={{ delay: 0 }} />);
      const trigger = screen.getByTestId('trigger-1');

      fireEvent.mouseEnter(trigger);
      fireEvent.mouseMove(trigger);

      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).not.toBe(null);
      });
    });
  });

  describe('prop: closeDelay', () => {
    it('respects custom closeDelay value', async () => {
      const user = userEvent.setup();
      render(() => <TestNavigationMenu rootProps={{ closeDelay: 0 }} />);
      const trigger = screen.getByTestId('trigger-1');

      await user.hover(trigger);
      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).not.toBe(null);
      });

      await user.unhover(trigger);
      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).toBe(null);
      });
    });
  });

  describe('prop: disabled', () => {
    it('does not open on hover when the trigger is disabled', async () => {
      render(() => <TestNavigationMenuWithDisabledTrigger />);
      const trigger = screen.getByTestId('trigger-1');

      fireEvent.mouseEnter(trigger);
      fireEvent.mouseMove(trigger);

      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });

      expect(screen.queryByTestId('popup-1')).toBe(null);
    });

    it('does not open on click when the trigger is disabled', async () => {
      render(() => <TestNavigationMenuWithDisabledTrigger />);
      const trigger = screen.getByTestId('trigger-1');

      fireEvent.click(trigger);

      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });

      expect(screen.queryByTestId('popup-1')).toBe(null);
    });
  });

  describe('nested menus', () => {
    it('handles inline nested menu without positioner/popup correctly', async () => {
      render(() => <TestInlineNestedNavigationMenu />);

      fireEvent.click(screen.getByTestId('trigger-1'));
      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).not.toBe(null);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('nested-popup-1')).not.toBe(null);
      });
    });

    it('switches content when hovering different nested triggers', async () => {
      render(() => <TestInlineNestedNavigationMenu />);

      fireEvent.click(screen.getByTestId('trigger-1'));
      await waitFor(() => {
        expect(screen.queryByTestId('nested-popup-1')).not.toBe(null);
      });

      fireEvent.click(screen.getByTestId('nested-trigger-2'));
      await waitFor(() => {
        expect(screen.queryByTestId('nested-popup-2')).not.toBe(null);
      });
    });

    it('closes the parent menu when a nested link with closeOnClick is clicked', async () => {
      const user = userEvent.setup();
      render(() => <TestInlineNestedNavigationMenu nestedLinkCloseOnClick />);

      await user.click(screen.getByTestId('trigger-1'));
      await waitFor(() => {
        expect(screen.queryByTestId('nested-popup-1')).not.toBe(null);
      });

      await user.click(screen.getByTestId('nested-link-1'));

      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).toBe(null);
      });
    });
  });
});

describe('<NavigationMenu.List />', () => {
  it('renders a `ul` element', () => {
    render(() => (
      <NavigationMenu.Root>
        <NavigationMenu.List data-testid="list" />
      </NavigationMenu.Root>
    ));
    const list = screen.getByTestId('list');
    expect(list.tagName).toBe('UL');
  });
});

describe('<NavigationMenu.Item />', () => {
  it('renders an `li` element', () => {
    render(() => (
      <NavigationMenu.Root>
        <NavigationMenu.List>
          <NavigationMenu.Item data-testid="item" />
        </NavigationMenu.List>
      </NavigationMenu.Root>
    ));
    const item = screen.getByTestId('item');
    expect(item.tagName).toBe('LI');
  });
});

describe('<NavigationMenu.Trigger />', () => {
  it('renders a `button` element', () => {
    render(() => (
      <NavigationMenu.Root>
        <NavigationMenu.List>
          <NavigationMenu.Item>
            <NavigationMenu.Trigger data-testid="trigger" />
          </NavigationMenu.Item>
        </NavigationMenu.List>
      </NavigationMenu.Root>
    ));
    const trigger = screen.getByTestId('trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('type', 'button');
  });

  it('opens a vertical menu with the mirrored arrow key in RTL mode', async () => {
    render(() => (
      <DirectionProvider direction="rtl">
        <NavigationMenu.Root orientation="vertical">
          <NavigationMenu.List>
            <NavigationMenu.Item>
              <NavigationMenu.Trigger>Overview</NavigationMenu.Trigger>
              <NavigationMenu.Content>
                <NavigationMenu.Link href="#">Quick Start</NavigationMenu.Link>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          </NavigationMenu.List>
          <NavigationMenu.Portal>
            <NavigationMenu.Positioner>
              <NavigationMenu.Popup>
                <NavigationMenu.Viewport />
              </NavigationMenu.Popup>
            </NavigationMenu.Positioner>
          </NavigationMenu.Portal>
        </NavigationMenu.Root>
      </DirectionProvider>
    ));

    const trigger = screen.getByRole('button', { name: 'Overview' });
    trigger.focus();

    fireEvent.keyDown(trigger, { key: 'ArrowLeft' });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Quick Start' })).toBeVisible();
    });
  });
});

describe('<NavigationMenu.Content />', () => {
  it('does not keep the content mounted in the DOM when keepMounted is false', () => {
    render(() => (
      <NavigationMenu.Root>
        <NavigationMenu.List>
          <NavigationMenu.Item>
            <NavigationMenu.Trigger>Item 1</NavigationMenu.Trigger>
            <NavigationMenu.Content data-testid="content-1">
              <NavigationMenu.Link href="#link-1">Link 1</NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        </NavigationMenu.List>
        <NavigationMenu.Portal>
          <NavigationMenu.Positioner>
            <NavigationMenu.Popup>
              <NavigationMenu.Viewport />
            </NavigationMenu.Popup>
          </NavigationMenu.Positioner>
        </NavigationMenu.Portal>
      </NavigationMenu.Root>
    ));

    expect(screen.queryAllByTestId('content-1').length).toBe(0);
  });

  it('keeps the content mounted (hidden) in the DOM when keepMounted is true', () => {
    render(() => (
      <NavigationMenu.Root>
        <NavigationMenu.List>
          <NavigationMenu.Item>
            <NavigationMenu.Trigger>Item 1</NavigationMenu.Trigger>
            <NavigationMenu.Content keepMounted data-testid="content-1">
              <NavigationMenu.Link href="#link-1">Link 1</NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        </NavigationMenu.List>
        <NavigationMenu.Portal>
          <NavigationMenu.Positioner>
            <NavigationMenu.Popup>
              <NavigationMenu.Viewport />
            </NavigationMenu.Popup>
          </NavigationMenu.Positioner>
        </NavigationMenu.Portal>
      </NavigationMenu.Root>
    ));

    const contents = screen.queryAllByTestId('content-1');
    expect(contents.length).toBe(1);
    expect(contents[0]).toHaveAttribute('hidden');
  });

  it('moves content into the popup and keeps it there when switching triggers', async () => {
    render(() => (
      <NavigationMenu.Root>
        <NavigationMenu.List data-testid="list">
          <NavigationMenu.Item value="item-1">
            <NavigationMenu.Trigger>Item 1</NavigationMenu.Trigger>
            <NavigationMenu.Content keepMounted data-testid="content-1">
              <NavigationMenu.Link href="#link-1">Link 1</NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
          <NavigationMenu.Item value="item-2">
            <NavigationMenu.Trigger>Item 2</NavigationMenu.Trigger>
            <NavigationMenu.Content keepMounted data-testid="content-2">
              <NavigationMenu.Link href="#link-2">Link 2</NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        </NavigationMenu.List>
        <NavigationMenu.Portal>
          <NavigationMenu.Positioner>
            <NavigationMenu.Popup>
              <NavigationMenu.Viewport data-testid="viewport" />
            </NavigationMenu.Popup>
          </NavigationMenu.Positioner>
        </NavigationMenu.Portal>
      </NavigationMenu.Root>
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Item 1' }));

    const viewport = await screen.findByTestId('viewport');
    await waitFor(() => {
      expect(viewport.contains(screen.getByTestId('content-1'))).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Item 2' }));

    await waitFor(() => {
      expect(screen.queryByTestId('content-2')).not.toBe(null);
    });

    expect(viewport.contains(screen.getByTestId('content-1'))).toBe(true);
    expect(viewport.contains(screen.getByTestId('content-2'))).toBe(true);
  });

  it('keeps content mounted inside the popup when closed if the portal is kept mounted', async () => {
    const user = userEvent.setup();
    render(() => (
      <NavigationMenu.Root>
        <NavigationMenu.List>
          <NavigationMenu.Item value="item-1">
            <NavigationMenu.Trigger>Item 1</NavigationMenu.Trigger>
            <NavigationMenu.Content keepMounted data-testid="content-1">
              <NavigationMenu.Link href="#link-1">Link 1</NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        </NavigationMenu.List>
        <NavigationMenu.Portal keepMounted>
          <NavigationMenu.Positioner>
            <NavigationMenu.Popup>
              <NavigationMenu.Viewport data-testid="viewport" />
            </NavigationMenu.Popup>
          </NavigationMenu.Positioner>
        </NavigationMenu.Portal>
      </NavigationMenu.Root>
    ));

    await user.click(screen.getByRole('button', { name: 'Item 1' }));

    const viewport = await screen.findByTestId('viewport');
    await waitFor(() => {
      expect(viewport.contains(screen.getByTestId('content-1'))).toBe(true);
    });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.getByTestId('content-1')).toHaveAttribute('hidden');
    });
    expect(viewport.contains(screen.getByTestId('content-1'))).toBe(true);
  });
});

describe('<NavigationMenu.Viewport />', () => {
  it('renders a `div` element', () => {
    render(() => (
      <NavigationMenu.Root>
        <NavigationMenu.Viewport data-testid="viewport" />
      </NavigationMenu.Root>
    ));
    expect(screen.getByTestId('viewport').tagName).toBe('DIV');
  });
});

describe('<NavigationMenu.Positioner />', () => {
  it('renders a `div` element', () => {
    render(() => (
      <NavigationMenu.Root value="test">
        <NavigationMenu.Portal>
          <NavigationMenu.Positioner data-testid="positioner" />
        </NavigationMenu.Portal>
      </NavigationMenu.Root>
    ));
    expect(screen.getByTestId('positioner').tagName).toBe('DIV');
  });
});

describe('<NavigationMenu.Popup />', () => {
  it('renders a `nav` element', () => {
    render(() => (
      <NavigationMenu.Root value="test">
        <NavigationMenu.Portal>
          <NavigationMenu.Positioner>
            <NavigationMenu.Popup data-testid="popup" />
          </NavigationMenu.Positioner>
        </NavigationMenu.Portal>
      </NavigationMenu.Root>
    ));
    expect(screen.getByTestId('popup').tagName).toBe('NAV');
  });
});

describe('<NavigationMenu.Portal />', () => {
  it('renders its children into the document body when open', () => {
    render(() => (
      <NavigationMenu.Root value="item">
        <NavigationMenu.Portal>
          <div data-testid="portal-content" />
        </NavigationMenu.Portal>
      </NavigationMenu.Root>
    ));
    expect(screen.getByTestId('portal-content').tagName).toBe('DIV');
  });

  it('does not render when closed unless keepMounted', () => {
    render(() => (
      <NavigationMenu.Root>
        <NavigationMenu.Portal>
          <div data-testid="portal-content" />
        </NavigationMenu.Portal>
      </NavigationMenu.Root>
    ));
    expect(screen.queryByTestId('portal-content')).toBe(null);
  });
});

describe('<NavigationMenu.Backdrop />', () => {
  it('renders a `div` element', () => {
    render(() => (
      <NavigationMenu.Root>
        <NavigationMenu.Backdrop data-testid="backdrop" />
      </NavigationMenu.Root>
    ));
    expect(screen.getByTestId('backdrop').tagName).toBe('DIV');
  });
});

describe('<NavigationMenu.Arrow />', () => {
  it('renders a `div` element', () => {
    render(() => (
      <NavigationMenu.Root value="test">
        <NavigationMenu.Portal>
          <NavigationMenu.Positioner>
            <NavigationMenu.Arrow data-testid="arrow" />
          </NavigationMenu.Positioner>
        </NavigationMenu.Portal>
      </NavigationMenu.Root>
    ));
    expect(screen.getByTestId('arrow').tagName).toBe('DIV');
  });
});

describe('<NavigationMenu.Link />', () => {
  describe('prop: closeOnClick', () => {
    it('closes the menu when clicking a link when true', async () => {
      const user = userEvent.setup();
      render(() => (
        <NavigationMenu.Root>
          <NavigationMenu.List>
            <NavigationMenu.Item value="item-1">
              <NavigationMenu.Trigger data-testid="trigger-1">Item 1</NavigationMenu.Trigger>
              <NavigationMenu.Content data-testid="popup-1">
                <NavigationMenu.Link href="#link-1" closeOnClick>
                  Link 1
                </NavigationMenu.Link>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          </NavigationMenu.List>

          <NavigationMenu.Portal>
            <NavigationMenu.Positioner>
              <NavigationMenu.Popup>
                <NavigationMenu.Viewport />
              </NavigationMenu.Popup>
            </NavigationMenu.Positioner>
          </NavigationMenu.Portal>
        </NavigationMenu.Root>
      ));

      const trigger = screen.getByTestId('trigger-1');
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).not.toBe(null);
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      const link = screen.getByRole('link', { name: 'Link 1' });
      await user.click(link);

      await waitFor(() => expect(screen.queryByTestId('popup-1')).toBe(null));
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('does not close the menu when clicking a link when false', async () => {
      const user = userEvent.setup();
      render(() => (
        <NavigationMenu.Root>
          <NavigationMenu.List>
            <NavigationMenu.Item value="item-1">
              <NavigationMenu.Trigger data-testid="trigger-1">Item 1</NavigationMenu.Trigger>
              <NavigationMenu.Content data-testid="popup-1">
                <NavigationMenu.Link href="#link-1" closeOnClick={false}>
                  Link 1
                </NavigationMenu.Link>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          </NavigationMenu.List>

          <NavigationMenu.Portal>
            <NavigationMenu.Positioner>
              <NavigationMenu.Popup>
                <NavigationMenu.Viewport />
              </NavigationMenu.Popup>
            </NavigationMenu.Positioner>
          </NavigationMenu.Portal>
        </NavigationMenu.Root>
      ));

      const trigger = screen.getByTestId('trigger-1');
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.queryByTestId('popup-1')).not.toBe(null);
      });

      const link = screen.getByRole('link', { name: 'Link 1' });
      await user.click(link);

      await waitFor(() => expect(screen.queryByTestId('popup-1')).not.toBe(null));
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('prop: active', () => {
    it('when `true`, renders with aria-current="page"', () => {
      render(() => (
        <NavigationMenu.Root>
          <NavigationMenu.List>
            <NavigationMenu.Item>
              <NavigationMenu.Link href="#" active>
                active
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          </NavigationMenu.List>
        </NavigationMenu.Root>
      ));
      expect(screen.getByRole('link', { name: 'active' })).toHaveAttribute('aria-current', 'page');
    });

    it('when `false`, does not render with aria-current="page"', () => {
      render(() => (
        <NavigationMenu.Root>
          <NavigationMenu.List>
            <NavigationMenu.Item>
              <NavigationMenu.Link href="#" active={false}>
                inactive
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          </NavigationMenu.List>
        </NavigationMenu.Root>
      ));
      expect(screen.getByRole('link', { name: 'inactive' })).not.toHaveAttribute('aria-current');
    });
  });
});

describe('<NavigationMenu.Icon />', () => {
  it('renders a default arrow glyph', () => {
    render(() => (
      <NavigationMenu.Root>
        <NavigationMenu.Item>
          <NavigationMenu.Icon data-testid="icon" />
        </NavigationMenu.Item>
      </NavigationMenu.Root>
    ));
    const icon = screen.getByTestId('icon');
    expect(icon.tagName).toBe('SPAN');
    expect(icon.textContent).toBe('▼');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
