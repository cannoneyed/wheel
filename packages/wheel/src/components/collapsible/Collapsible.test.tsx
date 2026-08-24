// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { Collapsible } from './index';
import { REASONS } from '../internals/reasons';

const PANEL_CONTENT = 'This is panel content';

describe('<Collapsible.Root />', () => {
  describe('ARIA attributes', () => {
    it('sets ARIA attributes', () => {
      const { getByRole, getByTestId } = render(() => (
        <Collapsible.Root defaultOpen>
          <Collapsible.Trigger />
          <Collapsible.Panel data-testid="panel" />
        </Collapsible.Root>
      ));

      const trigger = getByRole('button');
      const panel = getByTestId('panel');

      expect(trigger).toHaveAttribute('aria-expanded');
      expect(trigger).toHaveAttribute('aria-controls');
      expect(trigger.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
    });

    it('references manual panel id in trigger aria-controls', () => {
      const { getByRole, getByTestId } = render(() => (
        <Collapsible.Root defaultOpen>
          <Collapsible.Trigger />
          <Collapsible.Panel id="custom-panel-id" data-testid="panel" />
        </Collapsible.Root>
      ));

      const trigger = getByRole('button');
      const panel = getByTestId('panel');

      expect(trigger).toHaveAttribute('aria-controls', 'custom-panel-id');
      expect(panel).toHaveAttribute('id', 'custom-panel-id');
    });
  });

  describe('collapsible status', () => {
    it('disabled status', () => {
      const { getByRole } = render(() => (
        <Collapsible.Root disabled>
          <Collapsible.Trigger />
          <Collapsible.Panel data-testid="panel" />
        </Collapsible.Root>
      ));

      expect(getByRole('button')).toHaveAttribute('data-disabled');
    });

    it('does not toggle or call onOpenChange when clicked while disabled', async () => {
      const user = userEvent.setup();
      const handleOpenChange = vi.fn();

      const { getByRole, queryByText } = render(() => (
        <Collapsible.Root disabled onOpenChange={handleOpenChange}>
          <Collapsible.Trigger>Trigger</Collapsible.Trigger>
          <Collapsible.Panel>{PANEL_CONTENT}</Collapsible.Panel>
        </Collapsible.Root>
      ));

      const trigger = getByRole('button', { name: 'Trigger' });
      await user.click(trigger);

      expect(handleOpenChange).not.toHaveBeenCalled();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT)).toBe(null);
    });
  });

  describe('BaseUIChangeEventDetails', () => {
    it('calls onOpenChange with eventDetails', async () => {
      const user = userEvent.setup();
      const handleOpenChange = vi.fn();

      const { getByRole } = render(() => (
        <Collapsible.Root onOpenChange={handleOpenChange}>
          <Collapsible.Trigger>Toggle</Collapsible.Trigger>
          <Collapsible.Panel>{PANEL_CONTENT}</Collapsible.Panel>
        </Collapsible.Root>
      ));

      await user.click(getByRole('button', { name: 'Toggle' }));

      expect(handleOpenChange).toHaveBeenCalledTimes(1);
      const [openArg, details] = handleOpenChange.mock.calls[0] as [boolean, any];
      expect(openArg).toBe(true);
      expect(details).not.toBe(undefined);
      expect(details.reason).toBe(REASONS.triggerPress);
      expect(details.event).toBeInstanceOf(MouseEvent);
      expect(details.isCanceled).toBe(false);
      expect(typeof details.cancel).toBe('function');
      expect(typeof details.allowPropagation).toBe('function');
    });

    it('eventDetails.cancel() prevents opening while uncontrolled', async () => {
      const user = userEvent.setup();
      const handleOpenChange = vi.fn(
        (_nextOpen: boolean, eventDetails: Collapsible.Root.ChangeEventDetails) => {
          eventDetails.cancel();
        },
      );

      const { getByRole, queryByText } = render(() => (
        <Collapsible.Root onOpenChange={handleOpenChange}>
          <Collapsible.Trigger>Toggle</Collapsible.Trigger>
          <Collapsible.Panel>{PANEL_CONTENT}</Collapsible.Panel>
        </Collapsible.Root>
      ));

      const trigger = getByRole('button', { name: 'Toggle' });
      await user.click(trigger);

      expect(handleOpenChange).toHaveBeenCalledOnce();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT)).toBe(null);
    });

    it('eventDetails.cancel() prevents closing while uncontrolled', async () => {
      const user = userEvent.setup();
      const handleOpenChange = vi.fn(
        (_nextOpen: boolean, eventDetails: Collapsible.Root.ChangeEventDetails) => {
          eventDetails.cancel();
        },
      );

      const { getByRole, queryByText } = render(() => (
        <Collapsible.Root defaultOpen onOpenChange={handleOpenChange}>
          <Collapsible.Trigger>Toggle</Collapsible.Trigger>
          <Collapsible.Panel>{PANEL_CONTENT}</Collapsible.Panel>
        </Collapsible.Root>
      ));

      const trigger = getByRole('button', { name: 'Toggle' });
      await user.click(trigger);

      expect(handleOpenChange).toHaveBeenCalledOnce();
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(queryByText(PANEL_CONTENT)).not.toBe(null);
    });
  });

  describe('open state', () => {
    it('uncontrolled mode', async () => {
      const user = userEvent.setup();
      const { getByRole, queryByText } = render(() => (
        <Collapsible.Root defaultOpen={false}>
          <Collapsible.Trigger />
          <Collapsible.Panel>{PANEL_CONTENT}</Collapsible.Panel>
        </Collapsible.Root>
      ));

      const trigger = getByRole('button');

      expect(trigger).not.toHaveAttribute('aria-controls');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT)).toBe(null);

      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(trigger).toHaveAttribute('aria-controls');
      expect(queryByText(PANEL_CONTENT)).not.toBe(null);
      expect(queryByText(PANEL_CONTENT)).toHaveAttribute('data-open');
      expect(trigger).toHaveAttribute('data-panel-open');

      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).not.toHaveAttribute('aria-controls');
      expect(trigger).not.toHaveAttribute('data-panel-open');
      expect(queryByText(PANEL_CONTENT)).toBe(null);
    });

    it('controlled mode', async () => {
      const user = userEvent.setup();

      function App() {
        const [open, setOpen] = createSignal(false);
        return (
          <>
            <Collapsible.Root open={open()}>
              <Collapsible.Trigger>trigger</Collapsible.Trigger>
              <Collapsible.Panel>{PANEL_CONTENT}</Collapsible.Panel>
            </Collapsible.Root>
            <button type="button" onClick={() => setOpen((prev) => !prev)}>
              toggle
            </button>
          </>
        );
      }

      const { getByRole, queryByText } = render(() => <App />);

      const externalTrigger = getByRole('button', { name: 'toggle' });
      const trigger = getByRole('button', { name: 'trigger' });

      expect(trigger).not.toHaveAttribute('aria-controls');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT)).toBe(null);

      await user.click(externalTrigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(trigger).toHaveAttribute('aria-controls');
      expect(queryByText(PANEL_CONTENT)).not.toBe(null);
      expect(queryByText(PANEL_CONTENT)).toHaveAttribute('data-open');
      expect(trigger).toHaveAttribute('data-panel-open');

      await user.click(externalTrigger);

      expect(trigger).not.toHaveAttribute('aria-controls');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT)).toBe(null);
    });

    it('does not change controlled open state without an external update', async () => {
      const user = userEvent.setup();
      const handleOpenChange = vi.fn();

      const { getByRole, queryByText } = render(() => (
        <Collapsible.Root open={false} onOpenChange={handleOpenChange}>
          <Collapsible.Trigger>trigger</Collapsible.Trigger>
          <Collapsible.Panel>{PANEL_CONTENT}</Collapsible.Panel>
        </Collapsible.Root>
      ));

      const trigger = getByRole('button', { name: 'trigger' });
      await user.click(trigger);

      expect(handleOpenChange).toHaveBeenCalledOnce();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(queryByText(PANEL_CONTENT)).toBe(null);
    });
  });

  describe('state callbacks', () => {
    it('passes state to class and style callbacks', async () => {
      const user = userEvent.setup();
      const { getByTestId, getByRole } = render(() => (
        <Collapsible.Root
          data-testid="root"
          class={(state) => (state.open ? 'root-open' : 'root-closed')}
          style={(state) => ({ opacity: state.open ? 1 : 0.5 })}
        >
          <Collapsible.Trigger
            class={(state) => (state.open ? 'trigger-open' : 'trigger-closed')}
            style={(state) => ({ opacity: state.open ? 1 : 0.5 })}
          >
            Trigger
          </Collapsible.Trigger>
          <Collapsible.Panel
            keepMounted
            data-testid="panel"
            class={(state) => (state.open ? 'panel-open' : 'panel-closed')}
            style={(state) => ({ opacity: state.open ? 1 : 0.5 })}
          >
            {PANEL_CONTENT}
          </Collapsible.Panel>
        </Collapsible.Root>
      ));

      const root = getByTestId('root');
      const trigger = getByRole('button', { name: 'Trigger' });
      const panel = getByTestId('panel');

      expect(root).toHaveClass('root-closed');
      expect(root).toHaveStyle({ opacity: '0.5' });
      expect(trigger).toHaveClass('trigger-closed');
      expect(trigger).toHaveStyle({ opacity: '0.5' });
      expect(panel).toHaveClass('panel-closed');
      expect(panel).toHaveStyle({ opacity: '0.5' });

      await user.click(trigger);

      expect(root).toHaveClass('root-open');
      expect(root).toHaveStyle({ opacity: '1' });
      expect(trigger).toHaveClass('trigger-open');
      expect(trigger).toHaveStyle({ opacity: '1' });
      expect(panel).toHaveClass('panel-open');
      expect(panel).toHaveStyle({ opacity: '1' });
    });
  });

  describe('<Collapsible.Panel />', () => {
    describe('prop: keepMounted', () => {
      it('does not unmount the panel when true', async () => {
        const user = userEvent.setup();

        function App() {
          const [open, setOpen] = createSignal(false);
          return (
            <Collapsible.Root open={open()} onOpenChange={setOpen}>
              <Collapsible.Trigger />
              <Collapsible.Panel keepMounted>{PANEL_CONTENT}</Collapsible.Panel>
            </Collapsible.Root>
          );
        }

        const { getByRole, queryByText } = render(() => <App />);

        const trigger = getByRole('button');

        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(queryByText(PANEL_CONTENT)).not.toBe(null);
        expect(queryByText(PANEL_CONTENT)).not.toBeVisible();
        expect(queryByText(PANEL_CONTENT)).toHaveAttribute('data-closed');

        await user.click(trigger);

        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(trigger.getAttribute('aria-controls')).toBe(
          queryByText(PANEL_CONTENT)?.getAttribute('id'),
        );
        expect(queryByText(PANEL_CONTENT)).toBeVisible();
        expect(queryByText(PANEL_CONTENT)).toHaveAttribute('data-open');
        expect(trigger).toHaveAttribute('data-panel-open');

        await user.click(trigger);

        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(trigger.getAttribute('aria-controls')).toBe(null);
        expect(queryByText(PANEL_CONTENT)).not.toBeVisible();
        expect(queryByText(PANEL_CONTENT)).toHaveAttribute('data-closed');
      });
    });

    it('is not rendered when closed and keepMounted is not set', async () => {
      const user = userEvent.setup();
      const { getByRole, queryByTestId } = render(() => (
        <Collapsible.Root>
          <Collapsible.Trigger />
          <Collapsible.Panel data-testid="panel">{PANEL_CONTENT}</Collapsible.Panel>
        </Collapsible.Root>
      ));

      expect(queryByTestId('panel')).toBe(null);

      await user.click(getByRole('button'));

      expect(queryByTestId('panel')).not.toBe(null);
    });

    it('forwards the id prop', () => {
      const { getByTestId } = render(() => (
        <Collapsible.Root defaultOpen>
          <Collapsible.Trigger />
          <Collapsible.Panel id="my-panel" data-testid="panel" />
        </Collapsible.Root>
      ));

      expect(getByTestId('panel')).toHaveAttribute('id', 'my-panel');
    });
  });

  describe('<Collapsible.Trigger />', () => {
    it('forwards the id prop', () => {
      const { getByRole } = render(() => (
        <Collapsible.Root>
          <Collapsible.Trigger id="custom-trigger-id">Trigger</Collapsible.Trigger>
        </Collapsible.Root>
      ));

      expect(getByRole('button', { name: 'Trigger' })).toHaveAttribute(
        'id',
        'custom-trigger-id',
      );
    });

    it('supports asChild', () => {
      const { getByTestId } = render(() => (
        <Collapsible.Root>
          <Collapsible.Trigger asChild nativeButton={false}>
            {(props) => (
              <a data-testid="trigger" {...props}>
                Trigger
              </a>
            )}
          </Collapsible.Trigger>
        </Collapsible.Root>
      ));

      const trigger = getByTestId('trigger');
      expect(trigger.tagName).toBe('A');
      expect(trigger).toHaveAttribute('role', 'button');
    });
  });
});
