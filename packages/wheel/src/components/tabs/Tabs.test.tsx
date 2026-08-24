// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { Tabs } from './index';

describe('<Tabs.Root />', () => {
  describe('rendering + ARIA wiring', () => {
    it('renders a tablist, tabs, and tabpanel with the correct roles', () => {
      const { getByRole, getAllByRole } = render(() => (
        <Tabs.Root defaultValue={0}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value={0}>Panel 0</Tabs.Panel>
          <Tabs.Panel value={1}>Panel 1</Tabs.Panel>
        </Tabs.Root>
      ));

      expect(getByRole('tablist')).toBeTruthy();
      expect(getAllByRole('tab')).toHaveLength(2);
      expect(getByRole('tabpanel')).toBeTruthy();
    });

    it('sets aria-selected on the active tab and not on the others', () => {
      const { getAllByRole } = render(() => (
        <Tabs.Root value={1}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('wires aria-controls on the tab to the corresponding panel id', () => {
      const { getAllByRole, getByRole } = render(() => (
        <Tabs.Root defaultValue="a">
          <Tabs.List>
            <Tabs.Tab value="a">Tab A</Tabs.Tab>
            <Tabs.Tab value="b">Tab B</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">Panel A</Tabs.Panel>
          <Tabs.Panel value="b" keepMounted>
            Panel B
          </Tabs.Panel>
        </Tabs.Root>
      ));

      const [tabA] = getAllByRole('tab');
      const panelA = getByRole('tabpanel');
      expect(tabA).toHaveAttribute('aria-controls', panelA.id);
    });

    it('wires aria-labelledby on the panel to the corresponding tab id', () => {
      const { getAllByRole, getByRole } = render(() => (
        <Tabs.Root defaultValue="a">
          <Tabs.List>
            <Tabs.Tab value="a">Tab A</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">Panel A</Tabs.Panel>
        </Tabs.Root>
      ));

      const [tabA] = getAllByRole('tab');
      const panelA = getByRole('tabpanel');
      expect(panelA).toHaveAttribute('aria-labelledby', tabA.id);
    });

    it('does not add aria-orientation by default and adds it for vertical orientation', () => {
      const { getByRole: getByRoleHorizontal } = render(() => (
        <Tabs.Root defaultValue={0}>
          <Tabs.List>
            <Tabs.Tab value={0} />
          </Tabs.List>
        </Tabs.Root>
      ));
      expect(getByRoleHorizontal('tablist')).not.toHaveAttribute('aria-orientation');

      const { getByRole: getByRoleVertical } = render(() => (
        <Tabs.Root defaultValue={0} orientation="vertical">
          <Tabs.List>
            <Tabs.Tab value={0} />
          </Tabs.List>
        </Tabs.Root>
      ));
      expect(getByRoleVertical('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    });
  });

  describe('uncontrolled value', () => {
    it('selects the first tab by default', () => {
      const { getAllByRole } = render(() => (
        <Tabs.Root>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    });

    it('honors defaultValue', () => {
      const { getAllByRole } = render(() => (
        <Tabs.Root defaultValue={1}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('falls back to the first enabled tab when the default is disabled', () => {
      const { getAllByRole } = render(() => (
        <Tabs.Root>
          <Tabs.List>
            <Tabs.Tab value={0} disabled>
              Tab 0
            </Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('updates the selection when a tab is clicked', async () => {
      const user = userEvent.setup();
      const { getAllByRole } = render(() => (
        <Tabs.Root defaultValue={0}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      await user.click(tabs[1]);

      expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('controlled value', () => {
    it('follows the value prop', () => {
      const [value, setValue] = createSignal<number>(0);
      const { getAllByRole } = render(() => (
        <Tabs.Root value={value()}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

      setValue(1);
      expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('does not change selection on click without an external update', async () => {
      const user = userEvent.setup();
      const { getAllByRole } = render(() => (
        <Tabs.Root value={0}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      await user.click(tabs[1]);

      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('prop: onValueChange', () => {
    it('fires with the next value and event details on click', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const { getAllByRole } = render(() => (
        <Tabs.Root defaultValue={0} onValueChange={onValueChange}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      await user.click(getAllByRole('tab')[1]);

      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange.mock.calls[0][0]).toBe(1);
      expect(onValueChange.mock.calls[0][1].reason).toBe('none');
    });

    it('does not fire when clicking the already-active tab', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const { getAllByRole } = render(() => (
        <Tabs.Root defaultValue={0} onValueChange={onValueChange}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      await user.click(getAllByRole('tab')[0]);
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it('cancel() prevents the uncontrolled selection from moving', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn((_value, details) => details.cancel());
      const { getAllByRole } = render(() => (
        <Tabs.Root defaultValue={0} onValueChange={onValueChange}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      await user.click(tabs[1]);

      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    });

    it('notifies with reason "initial" when auto-selecting the first tab on mount', () => {
      const onValueChange = vi.fn();
      render(() => (
        <Tabs.Root onValueChange={onValueChange}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange.mock.calls[0][0]).toBe(0);
      expect(onValueChange.mock.calls[0][1].reason).toBe('initial');
    });
  });

  describe('arrow-key navigation', () => {
    it('moves focus forward and back with ArrowRight/ArrowLeft without activating (activateOnFocus=false)', async () => {
      const onValueChange = vi.fn();
      const { getAllByRole } = render(() => (
        <Tabs.Root value={0} onValueChange={onValueChange}>
          <Tabs.List activateOnFocus={false}>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
            <Tabs.Tab value={2}>Tab 2</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      tabs[0].focus();

      fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
      await Promise.resolve();

      expect(tabs[1]).toHaveFocus();
      expect(tabs[1]).toHaveAttribute('tabindex', '0');
      expect(onValueChange).not.toHaveBeenCalled();
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' });
      await Promise.resolve();

      expect(tabs[0]).toHaveFocus();
    });

    it('loops focus from the last tab to the first with ArrowRight', async () => {
      const { getAllByRole } = render(() => (
        <Tabs.Root value={2}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
            <Tabs.Tab value={2}>Tab 2</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      tabs[2].focus();
      fireEvent.keyDown(tabs[2], { key: 'ArrowRight' });
      await Promise.resolve();

      expect(tabs[0]).toHaveFocus();
    });
  });

  describe('prop: activateOnFocus', () => {
    it('activates the tab on arrow-key focus when activateOnFocus is true', async () => {
      const onValueChange = vi.fn();
      const { getAllByRole } = render(() => (
        <Tabs.Root value={0} onValueChange={onValueChange}>
          <Tabs.List activateOnFocus>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      tabs[0].focus();

      fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
      await Promise.resolve();

      expect(tabs[1]).toHaveFocus();
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange.mock.calls[0][0]).toBe(1);
    });

    it('does not activate the tab on focus when activateOnFocus is false', async () => {
      const onValueChange = vi.fn();
      const { getAllByRole } = render(() => (
        <Tabs.Root value={1} onValueChange={onValueChange}>
          <Tabs.List activateOnFocus={false}>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const [firstTab] = getAllByRole('tab');
      firstTab.focus();
      await Promise.resolve();

      expect(onValueChange).not.toHaveBeenCalled();
    });
  });

  describe('panel visibility + keepMounted', () => {
    it('hides the panel of an inactive tab and shows the active one', () => {
      const { getAllByRole } = render(() => (
        <Tabs.Root defaultValue={0}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value={0} keepMounted>
            Panel 0
          </Tabs.Panel>
          <Tabs.Panel value={1} keepMounted>
            Panel 1
          </Tabs.Panel>
        </Tabs.Root>
      ));

      const panels = getAllByRole('tabpanel', { hidden: true });
      expect(panels[0]).not.toHaveAttribute('hidden');
      expect(panels[1]).toHaveAttribute('hidden');
    });

    it('does not render the panel in the DOM when keepMounted is false and inactive', () => {
      const { queryAllByRole } = render(() => (
        <Tabs.Root defaultValue={0}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value={0}>Panel 0</Tabs.Panel>
          <Tabs.Panel value={1}>Panel 1</Tabs.Panel>
        </Tabs.Root>
      ));

      // Only the active panel is mounted.
      expect(queryAllByRole('tabpanel', { hidden: true })).toHaveLength(1);
    });

    it('switches visible panel content on click', async () => {
      const user = userEvent.setup();
      const { getAllByRole, getByRole } = render(() => (
        <Tabs.Root defaultValue={0}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value={0} keepMounted>
            Panel 0
          </Tabs.Panel>
          <Tabs.Panel value={1} keepMounted>
            Panel 1
          </Tabs.Panel>
        </Tabs.Root>
      ));

      await user.click(getAllByRole('tab')[1]);

      expect(getByRole('tabpanel')).toHaveTextContent('Panel 1');
    });
  });

  describe('data-* attributes', () => {
    it('sets data-orientation on the root, list, tab, and panel', () => {
      const { getByRole, getAllByRole } = render(() => (
        <Tabs.Root defaultValue={0} orientation="vertical" data-testid="root">
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value={0}>Panel 0</Tabs.Panel>
        </Tabs.Root>
      ));

      expect(getByRole('tablist')).toHaveAttribute('data-orientation', 'vertical');
      expect(getAllByRole('tab')[0]).toHaveAttribute('data-orientation', 'vertical');
      expect(getByRole('tabpanel')).toHaveAttribute('data-orientation', 'vertical');
    });

    it('sets data-active on the active tab and not on inactive tabs', () => {
      const { getAllByRole } = render(() => (
        <Tabs.Root value={0}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      expect(tabs[0]).toHaveAttribute('data-active', '');
      expect(tabs[1]).not.toHaveAttribute('data-active');
    });

    it('sets data-disabled on a disabled tab', () => {
      const { getAllByRole } = render(() => (
        <Tabs.Root value={1}>
          <Tabs.List>
            <Tabs.Tab value={0} disabled>
              Tab 0
            </Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      ));

      const tabs = getAllByRole('tab');
      expect(tabs[0]).toHaveAttribute('data-disabled', '');
      expect(tabs[1]).not.toHaveAttribute('data-disabled');
    });

    it('sets data-index on the panel', () => {
      const { getAllByRole } = render(() => (
        <Tabs.Root defaultValue={0}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Tab value={1}>Tab 1</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value={0} keepMounted>
            Panel 0
          </Tabs.Panel>
          <Tabs.Panel value={1} keepMounted>
            Panel 1
          </Tabs.Panel>
        </Tabs.Root>
      ));

      const panels = getAllByRole('tabpanel', { hidden: true });
      expect(panels[0]).toHaveAttribute('data-index', '0');
      expect(panels[1]).toHaveAttribute('data-index', '1');
    });
  });

  describe('<Tabs.Indicator />', () => {
    it('is not rendered when no tab is selected', () => {
      const { container } = render(() => (
        <Tabs.Root value={null}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Indicator data-testid="indicator" />
          </Tabs.List>
        </Tabs.Root>
      ));

      expect(container.querySelector('[data-testid="indicator"]')).toBeNull();
    });

    it('renders with role="presentation" and is hidden before layout settles (jsdom has no layout)', () => {
      const { getByTestId } = render(() => (
        <Tabs.Root value={0}>
          <Tabs.List>
            <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
            <Tabs.Indicator data-testid="indicator" />
          </Tabs.List>
        </Tabs.Root>
      ));

      const indicator = getByTestId('indicator');
      expect(indicator).toHaveAttribute('role', 'presentation');
      // jsdom reports zero-size layout rects, so the indicator stays hidden.
      expect(indicator).toHaveAttribute('hidden');
    });
  });

  it('supports class as a function of state', () => {
    const { getByRole } = render(() => (
      <Tabs.Root value={0} class={(state) => `orientation-${state.orientation}`}>
        <Tabs.List>
          <Tabs.Tab value={0}>Tab 0</Tabs.Tab>
        </Tabs.List>
      </Tabs.Root>
    ));

    expect(getByRole('tablist').parentElement).toHaveClass('orientation-horizontal');
  });
});
