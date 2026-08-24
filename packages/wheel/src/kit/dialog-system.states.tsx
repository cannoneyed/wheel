/**
 * DialogSystem's enumerated states — an open dialog (built from the
 * dialog-kit building blocks, the way real app dialogs are) and closed.
 */
import { defineStates } from '../core/states';

import { DialogSystem, connectDialogSystem } from './dialog-system';
import { ConfirmDialogView } from './dialog-kit';

const entry = {
  id: 'demo:confirm',
  render: () => (
    <ConfirmDialogView
      message="This can be undone with mod+z."
      options={{ title: 'Delete 3 cards?', danger: true, confirmLabel: 'Delete' }}
      respond={() => {}}
    />
  ),
  owner: null
};

/** DialogSystem states: a danger confirm open behind the scrim, and closed. */
export default defineStates({
  name: 'DialogSystem',
  component: DialogSystem,
  connection: connectDialogSystem,
  states: {
    'confirm open': {
      note: 'a dialog-kit confirm, scrim up',
      shape: {
        openId: 'demo:confirm',
        entryVersion: 1,
        close: () => {},
        entry: () => entry,
        enterOverlay: () => () => {},
        trapOverlayTab: () => false
      }
    },
    closed: {
      note: 'renders nothing',
      shape: {
        openId: null,
        entryVersion: 0,
        close: () => {},
        entry: () => null,
        enterOverlay: () => () => {},
        trapOverlayTab: () => false
      }
    }
  }
});
