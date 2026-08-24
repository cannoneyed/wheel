// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Drawer } from '../index';

afterEach(cleanup);

describe('<Drawer.Indent />', () => {
  it('sets data-active when any drawer is open', async () => {
    const [open, setOpen] = createSignal(false);

    render(() => (
      <Drawer.Provider>
        <Drawer.IndentBackground data-testid="bg" />
        <Drawer.Indent data-testid="indent">
          <Drawer.Root open={open()}>
            <Drawer.Trigger>Open</Drawer.Trigger>
          </Drawer.Root>
        </Drawer.Indent>
      </Drawer.Provider>
    ));

    expect(screen.getByTestId('indent')).toHaveAttribute('data-inactive', '');
    expect(screen.getByTestId('indent')).not.toHaveAttribute('data-active');

    setOpen(true);

    expect(screen.getByTestId('indent')).toHaveAttribute('data-active', '');
    expect(screen.getByTestId('indent')).not.toHaveAttribute('data-inactive');
    expect(screen.getByTestId('bg')).toHaveAttribute('data-active', '');
  });
});
