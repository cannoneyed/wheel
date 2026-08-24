// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { Accordion } from '../index';

describe('<Accordion.Item />', () => {
  describe('state', () => {
    it('does not report hidden=true after the item has started opening', async () => {
      const user = userEvent.setup();
      const renderSpy = vi.fn();

      const { getByRole } = render(() => (
        <Accordion.Root>
          <Accordion.Item
            asChild
            children={(props: Record<string, any>, state: any) => {
              renderSpy({ open: state.open, hidden: state.hidden });
              return (
                <div {...props}>
                  <Accordion.Header>
                    <Accordion.Trigger>Trigger</Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Panel>Panel</Accordion.Panel>
                </div>
              );
            }}
          />
        </Accordion.Root>
      ));

      await user.click(getByRole('button', { name: 'Trigger' }));

      expect(
        renderSpy.mock.calls.some(
          ([state]: [{ open: boolean; hidden: boolean }]) => state.open === true && state.hidden === true,
        ),
      ).toBe(false);
    });

    it('exposes data-index on the item, header, trigger and panel', () => {
      const { getByTestId, getAllByRole } = render(() => (
        <Accordion.Root defaultValue={[0, 1]} multiple>
          <Accordion.Item data-testid="item0" value={0}>
            <Accordion.Header data-testid="header0">
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel data-testid="panel0">Panel 1</Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item data-testid="item1" value={1}>
            <Accordion.Header data-testid="header1">
              <Accordion.Trigger>Trigger 2</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel data-testid="panel1">Panel 2</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      expect(getByTestId('item0')).toHaveAttribute('data-index', '0');
      expect(getByTestId('header0')).toHaveAttribute('data-index', '0');
      expect(getByTestId('panel0')).toHaveAttribute('data-index', '0');
      expect(getByTestId('item1')).toHaveAttribute('data-index', '1');
      expect(getByTestId('header1')).toHaveAttribute('data-index', '1');
      expect(getByTestId('panel1')).toHaveAttribute('data-index', '1');

      expect(getAllByRole('button')).toHaveLength(2);
    });

    it('combines item disabled with root disabled', () => {
      const { getByTestId } = render(() => (
        <Accordion.Root disabled>
          <Accordion.Item data-testid="item" value={0}>
            <Accordion.Header>
              <Accordion.Trigger>Trigger</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>Panel</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      expect(getByTestId('item')).toHaveAttribute('data-disabled');
    });
  });
});
