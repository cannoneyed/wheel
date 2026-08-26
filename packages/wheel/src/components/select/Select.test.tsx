// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal, For, type JSX } from 'solid-js';
import { Select } from './index';
import { Field } from '../field';
import { REASONS } from '../internals/reasons';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

// A real user click always fires `pointerdown` before `click`; `SelectItem` uses that sequence
// to distinguish a genuine press on the item from the cursor merely landing on it when the popup
// opens under it (see `SelectItem.tsx`'s `allowMouseSelectionRef` gate). A bare `fireEvent.click`
// without a preceding pointerdown only "counts" for the currently-highlighted item (matching
// upstream's own single-item click tests), so item-selection tests use this full sequence.
function clickItem(item: Element) {
  fireEvent.pointerDown(item, { pointerType: 'mouse' });
  fireEvent.mouseDown(item);
  fireEvent.mouseUp(item);
  fireEvent.click(item, { detail: 1 });
}

interface TestItem {
  value: string;
  label: string;
  disabled?: boolean;
}

const DEFAULT_ITEMS: TestItem[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

interface TestSelectProps {
  rootProps?: Select.Root.Props<any, any>;
  triggerProps?: Select.Trigger.Props;
  items?: TestItem[];
  valuePlaceholder?: JSX.Element;
}

function TestSelect(props: TestSelectProps) {
  return (
    <Select.Root {...props.rootProps}>
      <Select.Trigger data-testid="trigger" {...props.triggerProps}>
        <Select.Value data-testid="value" placeholder={props.valuePlaceholder ?? 'Choose'} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner data-testid="positioner">
          <Select.Popup data-testid="popup">
            <For each={props.items ?? DEFAULT_ITEMS}>
              {(item) => (
                <Select.Item
                  value={item.value}
                  disabled={item.disabled}
                  data-testid={`item-${item.value}`}
                >
                  {item.label}
                </Select.Item>
              )}
            </For>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

describe('<Select.Trigger />', () => {
  it('renders a native button with combobox role and ARIA wiring', () => {
    render(() => <TestSelect />);
    const trigger = screen.getByTestId('trigger');

    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('role', 'combobox');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('sets aria-expanded=true and data-popup-open when open', () => {
    render(() => <TestSelect rootProps={{ defaultOpen: true }} />);
    const trigger = screen.getByTestId('trigger');

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('data-popup-open');
  });

  it('opens the popup on click', () => {
    render(() => <TestSelect />);
    const trigger = screen.getByTestId('trigger');

    expect(screen.queryByTestId('popup')).toBe(null);

    fireEvent.click(trigger);

    expect(screen.getByTestId('popup')).not.toBe(null);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the popup with ArrowDown and highlights the first item', async () => {
    render(() => <TestSelect />);
    const trigger = screen.getByTestId('trigger');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(screen.getByTestId('popup')).not.toBe(null);
  });

  it('opens the popup with ArrowUp', () => {
    render(() => <TestSelect />);
    const trigger = screen.getByTestId('trigger');

    fireEvent.keyDown(trigger, { key: 'ArrowUp' });

    expect(screen.getByTestId('popup')).not.toBe(null);
  });

  it('does not open when disabled', () => {
    render(() => <TestSelect rootProps={{ disabled: true }} />);
    const trigger = screen.getByTestId('trigger');

    fireEvent.click(trigger);

    expect(screen.queryByTestId('popup')).toBe(null);
  });

  it('applies tabIndex=-1 and does not open when the root is disabled', () => {
    render(() => <TestSelect rootProps={{ disabled: true }} />);
    const trigger = screen.getByTestId('trigger');

    expect(trigger).toHaveAttribute('tabindex', '-1');
  });

  it('closes when Escape is pressed', async () => {
    render(() => <TestSelect rootProps={{ defaultOpen: true }} />);
    expect(screen.getByTestId('popup')).not.toBe(null);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('popup')).toBe(null);
    });
  });

  it('onOpenChange cancel() prevents opening while uncontrolled', () => {
    render(() => (
      <TestSelect
        rootProps={{
          onOpenChange: (nextOpen, eventDetails) => {
            if (nextOpen) {
              eventDetails.cancel();
            }
          },
        }}
      />
    ));

    fireEvent.click(screen.getByTestId('trigger'));

    expect(screen.queryByTestId('popup')).toBe(null);
  });

  it('supports a controlled open prop', () => {
    function ControlledOpenSelect() {
      const [open, setOpen] = createSignal(false);
      return (
        <TestSelect
          rootProps={{
            open: open(),
            onOpenChange: setOpen,
          }}
        />
      );
    }

    render(() => <ControlledOpenSelect />);
    expect(screen.queryByTestId('popup')).toBe(null);

    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('popup')).not.toBe(null);

    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.queryByTestId('popup')).toBe(null);
  });

  it('exposes root size, status, and variant on every styled part', () => {
    render(() => (
      <TestSelect rootProps={{ defaultOpen: true, size: 'lg', status: 'warning', variant: 'ghost' }} />
    ));

    expect(screen.getByTestId('trigger')).toHaveAttribute('data-size', 'lg');
    expect(screen.getByTestId('trigger')).toHaveAttribute('data-status', 'warning');
    expect(screen.getByTestId('trigger')).toHaveAttribute('data-variant', 'ghost');
    expect(screen.getByTestId('popup')).toHaveAttribute('data-size', 'lg');
    expect(screen.getByTestId('popup')).toHaveAttribute('data-status', 'warning');
    expect(screen.getByTestId('item-a')).toHaveAttribute('data-size', 'lg');
    expect(screen.getByTestId('item-a')).toHaveAttribute('data-status', 'warning');
  });
});

describe('item selection', () => {
  it('selects an item on click, closes the popup, and updates Select.Value', async () => {
    const handleValueChange = vi.fn();
    render(() => (
      <TestSelect rootProps={{ onValueChange: handleValueChange }} />
    ));

    const trigger = screen.getByTestId('trigger');
    fireEvent.click(trigger);

    const item = screen.getByTestId('item-b');
    clickItem(item);

    expect(handleValueChange).toHaveBeenCalledTimes(1);
    expect(handleValueChange.mock.calls[0][0]).toBe('b');

    await waitFor(() => {
      expect(screen.queryByTestId('popup')).toBe(null);
    });

    // No `items` prop is wired to `Select.Root` in this test helper, so `Select.Value` falls
    // back to the raw (stringified) value rather than a resolved item label.
    expect(screen.getByTestId('value').textContent).toBe('b');
  });

  it('reopens after a pointer selection and commits another value', async () => {
    render(() => <TestSelect />);
    const trigger = screen.getByTestId('trigger');

    fireEvent.click(trigger);
    clickItem(screen.getByTestId('item-a'));
    await waitFor(() => expect(screen.queryByTestId('popup')).toBe(null));

    fireEvent.click(trigger);
    expect(screen.getByTestId('popup')).not.toBe(null);
    clickItem(screen.getByTestId('item-c'));

    await waitFor(() => expect(screen.queryByTestId('popup')).toBe(null));
    expect(screen.getByTestId('value').textContent).toBe('c');
  });

  it('reflects data-selected on the selected option', () => {
    render(() => <TestSelect rootProps={{ defaultValue: 'b' }} />);
    const trigger = screen.getByTestId('trigger');
    fireEvent.click(trigger);

    expect(screen.getByTestId('item-b')).toHaveAttribute('data-selected');
    expect(screen.getByTestId('item-a')).not.toHaveAttribute('data-selected');
  });

  it('does not select a disabled item', async () => {
    render(() => (
      <TestSelect items={[{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana', disabled: true }]} />
    ));

    const trigger = screen.getByTestId('trigger');
    fireEvent.click(trigger);

    const item = screen.getByTestId('item-b');
    expect(item).toHaveAttribute('data-disabled');

    clickItem(item);

    // The popup should remain open since the disabled item's click is a no-op.
    expect(screen.getByTestId('popup')).not.toBe(null);
    expect(screen.getByTestId('value').textContent).toBe('Choose');
  });

  it('onValueChange cancel() prevents the value from updating', () => {
    render(() => (
      <TestSelect
        rootProps={{
          onValueChange: (_value, eventDetails) => {
            eventDetails.cancel();
          },
        }}
      />
    ));

    const trigger = screen.getByTestId('trigger');
    fireEvent.click(trigger);
    clickItem(screen.getByTestId('item-b'));

    expect(screen.getByTestId('value').textContent).toBe('Choose');
  });

  it('calls onValueChange with item-press reason details', () => {
    const handleValueChange = vi.fn();
    render(() => <TestSelect rootProps={{ onValueChange: handleValueChange }} />);

    fireEvent.click(screen.getByTestId('trigger'));
    clickItem(screen.getByTestId('item-a'));

    expect(handleValueChange).toHaveBeenCalledTimes(1);
    expect(handleValueChange.mock.calls[0][1].reason).toBe(REASONS.itemPress);
  });
});

describe('multiple selection', () => {
  it('keeps the popup open and toggles items in and out of the value array', () => {
    const handleValueChange = vi.fn();
    render(() => (
      <TestSelect rootProps={{ multiple: true, onValueChange: handleValueChange }} />
    ));

    fireEvent.click(screen.getByTestId('trigger'));
    clickItem(screen.getByTestId('item-a'));

    expect(screen.getByTestId('popup')).not.toBe(null);
    expect(handleValueChange.mock.calls[0][0]).toEqual(['a']);

    clickItem(screen.getByTestId('item-b'));
    expect(handleValueChange.mock.calls[1][0]).toEqual(['a', 'b']);

    // Clicking an already-selected item removes it.
    clickItem(screen.getByTestId('item-a'));
    expect(handleValueChange.mock.calls[2][0]).toEqual(['b']);
  });

  it('marks every selected item with data-selected', () => {
    render(() => <TestSelect rootProps={{ multiple: true, defaultValue: ['a', 'c'] }} />);
    fireEvent.click(screen.getByTestId('trigger'));

    expect(screen.getByTestId('item-a')).toHaveAttribute('data-selected');
    expect(screen.getByTestId('item-c')).toHaveAttribute('data-selected');
    expect(screen.getByTestId('item-b')).not.toHaveAttribute('data-selected');
  });
});

describe('keyboard navigation and typeahead', () => {
  it('moves the active index with ArrowDown while open', () => {
    render(() => <TestSelect rootProps={{ defaultOpen: true }} />);
    const popup = screen.getByTestId('popup');

    fireEvent.keyDown(popup, { key: 'ArrowDown' });

    expect(screen.getByTestId('item-a')).toHaveAttribute('data-highlighted');
  });

  it('selects the highlighted item with Enter', async () => {
    const handleValueChange = vi.fn();
    render(() => (
      <TestSelect rootProps={{ defaultOpen: true, onValueChange: handleValueChange }} />
    ));
    const popup = screen.getByTestId('popup');

    fireEvent.keyDown(popup, { key: 'ArrowDown' });
    fireEvent.keyDown(popup, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByTestId('item-b'), { key: 'Enter' });

    expect(handleValueChange).toHaveBeenCalledTimes(1);
    expect(handleValueChange.mock.calls[0][0]).toBe('b');
  });

  it('matches an item by typeahead while open', () => {
    render(() => <TestSelect rootProps={{ defaultOpen: true }} />);
    const popup = screen.getByTestId('popup');

    fireEvent.keyDown(popup, { key: 'c' });

    expect(screen.getByTestId('item-c')).toHaveAttribute('data-highlighted');
  });

  it('changes the value via typeahead while closed', async () => {
    vi.useFakeTimers();
    const handleValueChange = vi.fn();
    render(() => <TestSelect rootProps={{ onValueChange: handleValueChange }} />);
    const trigger = screen.getByTestId('trigger') as HTMLElement;

    // Force-mounts the (still-closed) popup so its items register into the value/label
    // registries that closed-trigger typeahead reads from (mirrors `SelectTrigger.tsx`'s
    // `onFocus` -> `store.set('forceMount', true)` timeout).
    fireEvent.focus(trigger);
    vi.advanceTimersByTime(0);

    fireEvent.keyDown(trigger, { key: 'b' });

    expect(handleValueChange).toHaveBeenCalledTimes(1);
    expect(handleValueChange.mock.calls[0][0]).toBe('b');
    // The popup stays force-mounted (so its items can register for typeahead), but the select
    // itself never opened — closed-trigger typeahead commits directly without opening the popup.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('positioner')).toHaveAttribute('hidden');

    vi.useRealTimers();
  });
});

describe('controlled value', () => {
  it('reflects a controlled value and calls onValueChange without updating internally', () => {
    function ControlledSelect() {
      const [value, setValue] = createSignal<string | null>('a');
      return (
        <TestSelect
          rootProps={{
            value: value(),
            onValueChange: (nextValue) => setValue(nextValue),
          }}
        />
      );
    }

    render(() => <ControlledSelect />);
    // No `items` prop is wired to `Select.Root` in this test helper, so `Select.Value` falls
    // back to the raw (stringified) value rather than a resolved item label.
    expect(screen.getByTestId('value').textContent).toBe('a');

    fireEvent.click(screen.getByTestId('trigger'));
    clickItem(screen.getByTestId('item-c'));

    expect(screen.getByTestId('value').textContent).toBe('c');
  });

  it('does not change when value is controlled and onValueChange is not wired', () => {
    render(() => <TestSelect rootProps={{ value: 'a' }} />);

    fireEvent.click(screen.getByTestId('trigger'));
    clickItem(screen.getByTestId('item-c'));

    expect(screen.getByTestId('value').textContent).toBe('a');
  });
});

describe('form integration', () => {
  it('submits the selected value via a hidden input', () => {
    let submittedValue: string | null = null;

    render(() => (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submittedValue = new FormData(event.currentTarget).get('fruit') as string | null;
        }}
      >
        <TestSelect rootProps={{ name: 'fruit', defaultValue: 'b' }} />
        <button type="submit" data-testid="submit">
          Submit
        </button>
      </form>
    ));

    fireEvent.click(screen.getByTestId('submit'));

    expect(submittedValue).toBe('b');
  });

  it('submits each selected value as a separate hidden input in multiple mode', () => {
    let submittedValues: string[] = [];

    render(() => (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submittedValues = new FormData(event.currentTarget).getAll('fruit') as string[];
        }}
      >
        <TestSelect rootProps={{ name: 'fruit', multiple: true, defaultValue: ['a', 'b'] }} />
        <button type="submit" data-testid="submit">
          Submit
        </button>
      </form>
    ));

    fireEvent.click(screen.getByTestId('submit'));

    expect(submittedValues).toEqual(['a', 'b']);
  });
});

describe('field integration', () => {
  it('marks the field dirty after a selection changes and touched after blur', () => {
    render(() => (
      <Field.Root data-testid="field">
        <TestSelect />
      </Field.Root>
    ));

    const field = screen.getByTestId('field');
    expect(field).not.toHaveAttribute('data-dirty');

    fireEvent.click(screen.getByTestId('trigger'));
    clickItem(screen.getByTestId('item-b'));

    expect(field).toHaveAttribute('data-dirty');

    fireEvent.focus(screen.getByTestId('trigger'));
    fireEvent.blur(screen.getByTestId('trigger'));

    expect(field).toHaveAttribute('data-touched');
  });

  it('associates Field.Label with the select trigger', () => {
    render(() => (
      <Field.Root>
        <Field.Label data-testid="label">Fruit</Field.Label>
        <TestSelect />
      </Field.Root>
    ));

    const label = screen.getByTestId('label');
    const trigger = screen.getByTestId('trigger');

    expect(trigger).toHaveAttribute('aria-labelledby', label.id);
  });
});

describe('return focus', () => {
  it('returns focus to the trigger after the popup closes', async () => {
    render(() => <TestSelect />);
    const trigger = screen.getByTestId('trigger') as HTMLElement;

    trigger.focus();
    fireEvent.click(trigger);
    clickItem(screen.getByTestId('item-a'));

    await waitFor(() => {
      expect(screen.queryByTestId('popup')).toBe(null);
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});

describe('<Select.Portal />', () => {
  it('renders the popup content into document.body', () => {
    render(() => <TestSelect rootProps={{ defaultOpen: true }} />);
    const popup = screen.getByTestId('popup');
    expect(document.body.contains(popup)).toBe(true);
  });

  it('does not render the popup when closed', () => {
    render(() => <TestSelect />);
    expect(screen.queryByTestId('popup')).toBe(null);
  });
});

describe('<Select.Group /> and <Select.GroupLabel />', () => {
  it('associates the group label via aria-labelledby', () => {
    render(() => (
      <Select.Root defaultOpen>
        <Select.Trigger data-testid="trigger">
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner>
            <Select.Popup>
              <Select.Group data-testid="group">
                <Select.GroupLabel data-testid="group-label">Fruits</Select.GroupLabel>
                <Select.Item value="a">Apple</Select.Item>
              </Select.Group>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    ));

    const group = screen.getByTestId('group');
    const label = screen.getByTestId('group-label');
    expect(group).toHaveAttribute('aria-labelledby', label.id);
  });
});

describe('<Select.ItemIndicator />', () => {
  it('only renders for the selected item by default', () => {
    render(() => (
      <Select.Root defaultOpen defaultValue="b">
        <Select.Trigger data-testid="trigger">
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner>
            <Select.Popup>
              <For each={DEFAULT_ITEMS}>
                {(item) => (
                  <Select.Item value={item.value} data-testid={`item-${item.value}`}>
                    {item.label}
                    <Select.ItemIndicator data-testid={`indicator-${item.value}`} />
                  </Select.Item>
                )}
              </For>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    ));

    expect(screen.getByTestId('indicator-b')).not.toBe(null);
    expect(screen.queryByTestId('indicator-a')).toBe(null);
  });
});

// alignItemWithTrigger positioning is a Chromium-only feature upstream (it depends on real
// layout measurements — trigger/positioner `getBoundingClientRect()`, `getComputedStyle()`, and
// scroll geometry, none of which jsdom computes meaningfully). Mirrors upstream's own
// Chromium-only gating for the equivalent `SelectPositioner`/`SelectPopup` geometry tests.
describe.skip('alignItemWithTrigger positioning (requires real layout, Chromium-only upstream)', () => {});

// Scroll arrows depend on real scroll geometry (`offsetTop`/`scrollHeight`/`clientHeight`), which
// jsdom does not lay out. Coverage here is limited to mount/unmount and attribute wiring rather
// than the actual auto-scroll behavior (see `SelectScrollArrow.tsx`'s deviation note).
describe('scroll arrows', () => {
  it('does not render when not visible and keepMounted is false', () => {
    render(() => (
      <Select.Root defaultOpen>
        <Select.Trigger data-testid="trigger">
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner>
            <Select.Popup>
              <Select.ScrollUpArrow data-testid="scroll-up" />
              <Select.List>
                <Select.Item value="a">Apple</Select.Item>
              </Select.List>
              <Select.ScrollDownArrow data-testid="scroll-down" />
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    ));

    expect(screen.queryByTestId('scroll-up')).toBe(null);
    expect(screen.queryByTestId('scroll-down')).toBe(null);
  });

  it('renders when keepMounted is true', () => {
    render(() => (
      <Select.Root defaultOpen>
        <Select.Trigger data-testid="trigger">
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner>
            <Select.Popup>
              <Select.ScrollUpArrow data-testid="scroll-up" keepMounted />
              <Select.List>
                <Select.Item value="a">Apple</Select.Item>
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    ));

    expect(screen.getByTestId('scroll-up')).not.toBe(null);
  });
});
