// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Drawer } from '../index';

afterEach(cleanup);

describe('<Drawer.Content />', () => {
  it('does not add public swipe-ignore attributes', async () => {
    render(() => (
      <Drawer.Root open>
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup>
              <Drawer.Content data-testid="content">Content</Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    expect(screen.getByTestId('content')).not.toHaveAttribute('data-swipe-ignore');
    expect(screen.getByTestId('content')).not.toHaveAttribute('data-base-ui-swipe-ignore');
  });
});
