/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { Dialog } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger>View notifications</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.25rem' }}>
            <Dialog.Title>Notifications</Dialog.Title>
            <Dialog.Description>
              You are all caught up. Good job!
            </Dialog.Description>
          </div>
          <div style={{ display: 'flex', 'justify-content': 'end', gap: '0.75rem' }}>
            <Dialog.Close>Close</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
