/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { Drawer } from 'wheel/components';

// Wheel supplies the component recipe classes.
// Trigger/Close reuse `wheel-Button` (button.css) the same way Popover.Trigger
// does in the popover exemplar — they're plain buttons, not Drawer's own
// styled surface.
export default function ExampleDrawer() {
  return (
    <Drawer.Root swipeDirection="right">
      <Drawer.Trigger data-testid="drawer-trigger">Open drawer</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop />
        <Drawer.Viewport>
          <Drawer.Popup data-testid="drawer-popup">
            <Drawer.Content>
              <Drawer.Title>Drawer</Drawer.Title>
              <Drawer.Description>
                This is a drawer that slides in from the side. You can swipe to dismiss it.
              </Drawer.Description>
              <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '0.75rem' }}>
                <Drawer.Close>Close</Drawer.Close>
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
