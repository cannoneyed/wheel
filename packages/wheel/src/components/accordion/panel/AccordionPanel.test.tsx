// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import { Accordion } from '../index';

const PANEL_CONTENT = 'This is panel content';

describe('<Accordion.Panel />', () => {
  it('passes root keepMounted to closed panels', () => {
    const { getByText } = render(() => (
      <Accordion.Root keepMounted>
        <Accordion.Item value={0}>
          <Accordion.Header>
            <Accordion.Trigger>Trigger</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>{PANEL_CONTENT}</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    ));

    expect(getByText(PANEL_CONTENT)).toHaveAttribute('hidden');
  });

  it('passes root hiddenUntilFound to closed panels and allows panel overrides', () => {
    const { getByText, queryByText } = render(() => (
      <Accordion.Root hiddenUntilFound keepMounted>
        <Accordion.Item value={0}>
          <Accordion.Header>
            <Accordion.Trigger>Trigger 1</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>{PANEL_CONTENT}</Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value={1}>
          <Accordion.Header>
            <Accordion.Trigger>Trigger 2</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel hiddenUntilFound={false} keepMounted={false}>
            Overridden panel
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    ));

    expect(getByText(PANEL_CONTENT).getAttribute('hidden')).toBe('until-found');
    expect(queryByText('Overridden panel')).toBe(null);
  });

  it('is not rendered when closed and keepMounted is not set', async () => {
    const { queryByTestId, getByRole } = render(() => (
      <Accordion.Root>
        <Accordion.Item>
          <Accordion.Header>
            <Accordion.Trigger>Trigger</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel data-testid="panel">{PANEL_CONTENT}</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    ));

    expect(queryByTestId('panel')).toBe(null);

    getByRole('button').click();

    expect(queryByTestId('panel')).not.toBe(null);
  });

  it('forwards the id prop', () => {
    const { getByTestId } = render(() => (
      <Accordion.Root defaultValue={[0]}>
        <Accordion.Item value={0}>
          <Accordion.Header>
            <Accordion.Trigger>Trigger</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel id="my-panel" data-testid="panel">
            {PANEL_CONTENT}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    ));

    expect(getByTestId('panel')).toHaveAttribute('id', 'my-panel');
  });

  it('sets the CSS custom properties for height and width while open', () => {
    const { getByText } = render(() => (
      <Accordion.Root defaultValue={[0]}>
        <Accordion.Item value={0}>
          <Accordion.Header>
            <Accordion.Trigger>Trigger</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>{PANEL_CONTENT}</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    ));

    const panel = getByText(PANEL_CONTENT);
    expect(panel.style.getPropertyValue('--accordion-panel-height')).not.toBe('');
    expect(panel.style.getPropertyValue('--accordion-panel-width')).not.toBe('');
  });
});
