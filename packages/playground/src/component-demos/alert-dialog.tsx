/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { AlertDialog } from 'wheel/components';

// Wheel supplies the component recipe classes.
// AlertDialog's Backdrop/Popup/Title/Description/Close are literal re-exports
// of the Dialog parts, so they reuse the Dialog recipe's wheel-Dialog-* classes.
export default function ExampleAlertDialog() {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger data-color="red">
        Discard draft
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop />
        <AlertDialog.Popup>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.25rem' }}>
            <AlertDialog.Title>Discard draft?</AlertDialog.Title>
            <AlertDialog.Description>
              You can't undo this action.
            </AlertDialog.Description>
          </div>
          <div style={{ display: 'flex', 'justify-content': 'end', gap: '0.75rem' }}>
            <AlertDialog.Close>Cancel</AlertDialog.Close>
            <AlertDialog.Close data-color="red">
              Discard
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
