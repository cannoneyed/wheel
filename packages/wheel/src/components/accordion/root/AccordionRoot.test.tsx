// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { Accordion } from '../index';
import { REASONS } from '../../internals/reasons';

const PANEL_CONTENT_1 = 'Panel contents 1';
const PANEL_CONTENT_2 = 'Panel contents 2';

describe('<Accordion.Root />', () => {
  describe('ARIA attributes', () => {
    it('renders correct ARIA attributes', () => {
      const { getByRole, queryByText } = render(() => (
        <Accordion.Root defaultValue={[0]}>
          <Accordion.Item value={0}>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const trigger = getByRole('button');
      const panel = queryByText(PANEL_CONTENT_1) as HTMLElement;

      expect(trigger).toHaveAttribute('aria-controls');
      expect(panel.getAttribute('id')).toBe(trigger.getAttribute('aria-controls'));
      expect(panel).toHaveAttribute('role', 'region');
      expect(trigger.getAttribute('id')).toBe(panel.getAttribute('aria-labelledby'));
    });

    it('references manual panel id in trigger aria-controls', () => {
      const { getByRole, queryByText } = render(() => (
        <Accordion.Root defaultValue={[0]}>
          <Accordion.Item value={0}>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel id="custom-panel-id">{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const trigger = getByRole('button');
      const panel = queryByText(PANEL_CONTENT_1) as HTMLElement;

      expect(trigger).toHaveAttribute('aria-controls', 'custom-panel-id');
      expect(panel).toHaveAttribute('id', 'custom-panel-id');
    });

    it('references manual trigger id in panel aria-labelledby', () => {
      const { getByText } = render(() => (
        <Accordion.Root defaultValue={[0]}>
          <Accordion.Item value={0}>
            <Accordion.Header>
              <Accordion.Trigger id="custom-trigger-id">Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const panel = getByText(PANEL_CONTENT_1);

      expect(panel).toHaveAttribute('aria-labelledby', 'custom-trigger-id');
    });
  });

  describe('uncontrolled', () => {
    it('open state', async () => {
      const user = userEvent.setup();
      const { getByRole, queryByText } = render(() => (
        <Accordion.Root>
          <Accordion.Item>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const trigger = getByRole('button');

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT_1)).toBe(null);

      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(trigger).toHaveAttribute('data-panel-open');
      expect(queryByText(PANEL_CONTENT_1)).not.toBe(null);
      expect(queryByText(PANEL_CONTENT_1)).toBeVisible();
      expect(queryByText(PANEL_CONTENT_1)).toHaveAttribute('data-open');

      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT_1)).toBe(null);
    });

    describe('prop: defaultValue', () => {
      it('custom item value', () => {
        const { queryByText } = render(() => (
          <Accordion.Root defaultValue={['first']}>
            <Accordion.Item value="first">
              <Accordion.Header>
                <Accordion.Trigger>Trigger 1</Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="second">
              <Accordion.Header>
                <Accordion.Trigger>Trigger 2</Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Panel>{PANEL_CONTENT_2}</Accordion.Panel>
            </Accordion.Item>
          </Accordion.Root>
        ));

        expect(queryByText(PANEL_CONTENT_1)).not.toBe(null);
        expect(queryByText(PANEL_CONTENT_1)).toBeVisible();
        expect(queryByText(PANEL_CONTENT_1)).toHaveAttribute('data-open');

        expect(queryByText(PANEL_CONTENT_2)).toBe(null);
      });
    });
  });

  describe('controlled', () => {
    it('open state', async () => {
      const user = userEvent.setup();

      function App() {
        const [value, setValue] = createSignal<number[]>([]);
        return (
          <Accordion.Root value={value()} onValueChange={setValue}>
            <Accordion.Item value={0}>
              <Accordion.Header>
                <Accordion.Trigger>Trigger 1</Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
            </Accordion.Item>
          </Accordion.Root>
        );
      }

      const { getByRole, queryByText } = render(() => <App />);

      const trigger = getByRole('button');

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT_1)).toBe(null);

      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(trigger).toHaveAttribute('data-panel-open');
      expect(queryByText(PANEL_CONTENT_1)).not.toBe(null);
      expect(queryByText(PANEL_CONTENT_1)).toBeVisible();
      expect(queryByText(PANEL_CONTENT_1)).toHaveAttribute('data-open');

      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT_1)).toBe(null);
    });

    describe('prop: value', () => {
      it('custom item value', () => {
        const { queryByText } = render(() => (
          <Accordion.Root value={['one']}>
            <Accordion.Item value="one">
              <Accordion.Header>
                <Accordion.Trigger>Trigger 1</Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="second">
              <Accordion.Header>
                <Accordion.Trigger>Trigger 2</Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Panel>{PANEL_CONTENT_2}</Accordion.Panel>
            </Accordion.Item>
          </Accordion.Root>
        ));

        expect(queryByText(PANEL_CONTENT_1)).not.toBe(null);
        expect(queryByText(PANEL_CONTENT_1)).toBeVisible();
        expect(queryByText(PANEL_CONTENT_1)).toHaveAttribute('data-open');

        expect(queryByText(PANEL_CONTENT_2)).toBe(null);
      });
    });
  });

  describe('prop: disabled', () => {
    it('can disable the whole accordion', () => {
      const { getByTestId, queryByText, getAllByRole } = render(() => (
        <Accordion.Root defaultValue={[0]} disabled>
          <Accordion.Item data-testid="item1" value={0}>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item data-testid="item2" value={1}>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 2</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_2}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const item1 = getByTestId('item1');
      const panel1 = queryByText(PANEL_CONTENT_1);
      const [header1, header2] = getAllByRole('heading');
      const [trigger1, trigger2] = getAllByRole('button');
      const item2 = getByTestId('item2');

      [item1, header1, trigger1, panel1, item2, header2, trigger2].forEach((element) => {
        expect(element).toHaveAttribute('data-disabled');
      });
    });

    it('can disable one accordion item', () => {
      const { getByTestId, queryByText, getAllByRole } = render(() => (
        <Accordion.Root defaultValue={[0]}>
          <Accordion.Item data-testid="item1" value={0} disabled>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item data-testid="item2" value={1}>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 2</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_2}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const item1 = getByTestId('item1');
      const panel1 = queryByText(PANEL_CONTENT_1);
      const [header1, header2] = getAllByRole('heading');
      const [trigger1, trigger2] = getAllByRole('button');
      const item2 = getByTestId('item2');

      [item1, header1, trigger1, panel1].forEach((element) => {
        expect(element).toHaveAttribute('data-disabled');
      });
      [item2, header2, trigger2].forEach((element) => {
        expect(element).not.toHaveAttribute('data-disabled');
      });
    });

    it.each(['root', 'item'] as const)(
      'does not toggle or fire callbacks when the %s is disabled',
      async (disabledPart) => {
        const user = userEvent.setup();
        const onValueChange = vi.fn();
        const onOpenChange = vi.fn();

        const { getAllByRole, queryByText } = render(() => (
          <Accordion.Root disabled={disabledPart === 'root'} onValueChange={onValueChange}>
            <Accordion.Item value={0} disabled={disabledPart === 'item'} onOpenChange={onOpenChange}>
              <Accordion.Header>
                <Accordion.Trigger disabled={false}>Trigger 1</Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
            </Accordion.Item>
          </Accordion.Root>
        ));

        const [trigger1] = getAllByRole('button');

        await user.click(trigger1);

        expect(trigger1).toHaveAttribute('aria-expanded', 'false');
        expect(queryByText(PANEL_CONTENT_1)).toBe(null);
        expect(onValueChange).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalled();
      },
    );
  });

  describe('BaseUIChangeEventDetails', () => {
    it('onOpenChange cancel() prevents opening while uncontrolled', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();

      const { getByRole, queryByText } = render(() => (
        <Accordion.Root onValueChange={onValueChange}>
          <Accordion.Item
            value={0}
            onOpenChange={(nextOpen, eventDetails) => {
              if (nextOpen) {
                eventDetails.cancel();
              }
            }}
          >
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const trigger = getByRole('button');
      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT_1)).toBe(null);
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it('onValueChange cancel() prevents opening while uncontrolled', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn((_value: number[], eventDetails: any) => {
        eventDetails.cancel();
      });

      const { getByRole, queryByText } = render(() => (
        <Accordion.Root onValueChange={onValueChange}>
          <Accordion.Item value={0}>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const trigger = getByRole('button');
      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT_1)).toBe(null);
      expect(onValueChange).toHaveBeenCalledOnce();
    });

    it('onOpenChange cancel() prevents onValueChange while controlled', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();

      const { getByRole, queryByText } = render(() => (
        <Accordion.Root value={[]} onValueChange={onValueChange}>
          <Accordion.Item
            value={0}
            onOpenChange={(nextOpen, eventDetails) => {
              if (nextOpen) {
                eventDetails.cancel();
              }
            }}
          >
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const trigger = getByRole('button');
      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT_1)).toBe(null);
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it('onValueChange cancel() prevents opening while multiple', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn((_value: number[], eventDetails: any) => {
        eventDetails.cancel();
      });

      const { getByRole, queryByText } = render(() => (
        <Accordion.Root multiple onValueChange={onValueChange}>
          <Accordion.Item value={0}>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const trigger = getByRole('button');
      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT_1)).toBe(null);
      expect(onValueChange).toHaveBeenCalledOnce();
    });

    it('onValueChange cancel() prevents closing while multiple', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn((_value: number[], eventDetails: any) => {
        eventDetails.cancel();
      });

      const { getByRole, queryByText } = render(() => (
        <Accordion.Root defaultValue={[0]} multiple onValueChange={onValueChange}>
          <Accordion.Item value={0}>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const trigger = getByRole('button');
      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(queryByText(PANEL_CONTENT_1)).not.toBe(null);
      expect(onValueChange).toHaveBeenCalledOnce();
    });
  });

  describe('prop: multiple', () => {
    it('multiple items can be open when `multiple = true`', async () => {
      const user = userEvent.setup();
      const { getAllByRole, queryByText } = render(() => (
        <Accordion.Root multiple>
          <Accordion.Item>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 2</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_2}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const [trigger1, trigger2] = getAllByRole('button');

      expect(trigger1).not.toHaveAttribute('data-panel-open');
      expect(trigger2).not.toHaveAttribute('data-panel-open');
      expect(queryByText(PANEL_CONTENT_1)).toBe(null);
      expect(queryByText(PANEL_CONTENT_2)).toBe(null);

      await user.click(trigger1);
      await user.click(trigger2);

      expect(queryByText(PANEL_CONTENT_1)).toHaveAttribute('data-open');
      expect(queryByText(PANEL_CONTENT_2)).toHaveAttribute('data-open');
      expect(trigger1).toHaveAttribute('data-panel-open');
      expect(trigger2).toHaveAttribute('data-panel-open');
    });

    it('when false only one item can be open', async () => {
      const user = userEvent.setup();
      const { getAllByRole, queryByText } = render(() => (
        <Accordion.Root multiple={false}>
          <Accordion.Item>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 2</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>{PANEL_CONTENT_2}</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const [trigger1, trigger2] = getAllByRole('button');

      await user.click(trigger1);

      expect(queryByText(PANEL_CONTENT_1)).toHaveAttribute('data-open');
      expect(trigger1).toHaveAttribute('data-panel-open');

      await user.click(trigger2);

      expect(queryByText(PANEL_CONTENT_2)).toHaveAttribute('data-open');
      expect(trigger2).toHaveAttribute('data-panel-open');
      expect(queryByText(PANEL_CONTENT_1)).toBe(null);
      expect(trigger1).not.toHaveAttribute('data-panel-open');
    });
  });

  describe('prop: onValueChange', () => {
    it('default item value', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();

      const { getAllByRole } = render(() => (
        <Accordion.Root onValueChange={onValueChange} multiple>
          <Accordion.Item value={0}>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>1</Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value={1}>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 2</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>2</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const [trigger1, trigger2] = getAllByRole('button');

      expect(onValueChange).not.toHaveBeenCalled();

      await user.click(trigger1);

      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange.mock.calls[0][0]).toEqual([0]);
      expect(onValueChange.mock.calls[0][1].reason).toBe(REASONS.triggerPress);

      await user.click(trigger2);

      expect(onValueChange).toHaveBeenCalledTimes(2);
      expect(onValueChange.mock.calls[1][0]).toEqual([0, 1]);
    });

    it('custom item value', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();

      const { getAllByRole } = render(() => (
        <Accordion.Root onValueChange={onValueChange} multiple>
          <Accordion.Item value="one">
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>1</Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="two">
            <Accordion.Header>
              <Accordion.Trigger>Trigger 2</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>2</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const [trigger1, trigger2] = getAllByRole('button');

      await user.click(trigger2);

      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange.mock.calls[0][0]).toEqual(['two']);

      await user.click(trigger1);

      expect(onValueChange).toHaveBeenCalledTimes(2);
      expect(onValueChange.mock.calls[1][0]).toEqual(['two', 'one']);
    });

    it('`multiple` is false', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();

      const { getAllByRole } = render(() => (
        <Accordion.Root onValueChange={onValueChange} multiple={false}>
          <Accordion.Item value="one">
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>1</Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="two">
            <Accordion.Header>
              <Accordion.Trigger>Trigger 2</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>2</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const [trigger1, trigger2] = getAllByRole('button');

      await user.click(trigger1);

      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange.mock.calls[0][0]).toEqual(['one']);

      await user.click(trigger2);

      expect(onValueChange).toHaveBeenCalledTimes(2);
      expect(onValueChange.mock.calls[1][0]).toEqual(['two']);
    });
  });
});
