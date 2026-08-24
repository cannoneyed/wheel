// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Combobox.ItemIndicator />', () => {
  it('is not rendered for unselected items by default', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']} defaultOpen>
        <Combobox.Input />
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup>
              <Combobox.List>
                {(value: string) => (
                  <Combobox.Item value={value} data-testid={`item-${value}`}>
                    {value}
                    <Combobox.ItemIndicator data-testid={`indicator-${value}`} />
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    ));
    expect(screen.queryByTestId('indicator-a')).not.toBeInTheDocument();
  });

  it('is rendered for the selected item', async () => {
    render(() => (
      <Combobox.Root items={['a', 'b']} defaultValue="a" defaultOpen>
        <Combobox.Input />
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup>
              <Combobox.List>
                {(value: string) => (
                  <Combobox.Item value={value} data-testid={`item-${value}`}>
                    {value}
                    <Combobox.ItemIndicator data-testid={`indicator-${value}`} />
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    ));
    expect(await screen.findByTestId('indicator-a')).toBeInTheDocument();
    expect(screen.queryByTestId('indicator-b')).not.toBeInTheDocument();
  });
});
