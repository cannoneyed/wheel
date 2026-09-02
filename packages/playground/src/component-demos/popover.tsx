/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
import { Popover } from 'wheel/components';

// Wheel supplies the component recipe classes.
// The elevated popup deliberately has no arrow: the theme's shadow-ring
// border treatment reads cleanest as a detached surface.
export default function ExamplePopover() {
  return (
    <Popover.Root>
      <Popover.Trigger>Notifications</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8}>
          <Popover.Popup>
            <Popover.Title>Notifications</Popover.Title>
            <Popover.Description>
              You are all caught up. Good job!
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
