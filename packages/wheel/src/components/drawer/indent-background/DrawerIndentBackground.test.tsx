// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Drawer } from '../index';

afterEach(cleanup);

describe('<Drawer.IndentBackground />', () => {
  it('sets data-active when any drawer is open', async () => {
    const [open, setOpen] = createSignal(false);

    render(() => (
      <Drawer.Provider>
        <Drawer.IndentBackground data-testid="bg" />
        <Drawer.Root open={open()}>
          <Drawer.Trigger>Open</Drawer.Trigger>
        </Drawer.Root>
      </Drawer.Provider>
    ));

    const background = screen.getByTestId('bg');

    expect(background.getAttribute('data-inactive')).toBe('');
    expect(background.getAttribute('data-active')).toBeNull();

    setOpen(true);

    expect(background.getAttribute('data-active')).toBe('');
    expect(background.getAttribute('data-inactive')).toBeNull();
  });
});
