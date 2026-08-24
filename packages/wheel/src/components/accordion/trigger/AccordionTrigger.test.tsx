// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { Accordion } from '../index';

describe('<Accordion.Trigger />', () => {
  it('forwards the id prop', () => {
    const { getByRole } = render(() => (
      <Accordion.Root>
        <Accordion.Item>
          <Accordion.Header>
            <Accordion.Trigger id="custom-trigger-id">Trigger</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>Panel</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    ));

    expect(getByRole('button', { name: 'Trigger' })).toHaveAttribute('id', 'custom-trigger-id');
  });

  it('keeps a non-native trigger tabbable', () => {
    const { getByRole } = render(() => (
      <Accordion.Root>
        <Accordion.Item>
          <Accordion.Header>
            <Accordion.Trigger nativeButton={false} as="span">
              Trigger
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>Panel</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    ));

    const trigger = getByRole('button', { name: 'Trigger' });
    expect(trigger).toHaveAttribute('tabindex', '0');
    expect(trigger.tagName).toBe('SPAN');
  });

  it('supports asChild', () => {
    const { getByTestId } = render(() => (
      <Accordion.Root>
        <Accordion.Item>
          <Accordion.Header>
            <Accordion.Trigger asChild nativeButton={false}>
              {(props: Record<string, any>) => (
                <a data-testid="trigger" {...props}>
                  Trigger
                </a>
              )}
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>Panel</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    ));

    const trigger = getByTestId('trigger');
    expect(trigger.tagName).toBe('A');
    expect(trigger).toHaveAttribute('role', 'button');
  });

  describe('keyboard activation timing', () => {
    it('opens and closes on Space keyup', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      const { getByRole, queryByText } = render(() => (
        <Accordion.Root>
          <Accordion.Item onOpenChange={onOpenChange}>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>Panel contents</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const trigger = getByRole('button');
      trigger.focus();

      await user.keyboard('[Space>]');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText('Panel contents')).toBe(null);
      expect(onOpenChange).not.toHaveBeenCalled();

      await user.keyboard('[/Space]');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(queryByText('Panel contents')).not.toBe(null);
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenLastCalledWith(true, expect.anything());
    });

    it('Enter toggles the open state', async () => {
      const user = userEvent.setup();

      const { getByRole, queryByText } = render(() => (
        <Accordion.Root>
          <Accordion.Item>
            <Accordion.Header>
              <Accordion.Trigger>Trigger 1</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>Panel contents</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ));

      const trigger = getByRole('button');
      trigger.focus();

      await user.keyboard('[Enter]');

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(queryByText('Panel contents')).not.toBe(null);
    });
  });

  it('does not toggle when the trigger is disabled', async () => {
    const user = userEvent.setup();

    const { getByRole, queryByText } = render(() => (
      <Accordion.Root>
        <Accordion.Item>
          <Accordion.Header>
            <Accordion.Trigger disabled>Trigger</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>Panel contents</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    ));

    const trigger = getByRole('button');
    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(queryByText('Panel contents')).toBe(null);
  });
});
