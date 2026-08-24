/**
 * <DialogSystem/> — mount once at the root. Owns everything global about the
 * open dialog: the portal, the scrim, Escape, and focus capture/restore
 * (via FocusService). Content comes from the DialogService entry: built-ins
 * and imperative dialogs render at root; declarative dialogs render under
 * their captured declaration-site owner.
 */
import { createEffect, onCleanup, runWithOwner, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

import { Show } from '../core/visibility';
import { componentRoot, connect } from '../core/connect';
import { view } from '../core/view';
import { DialogService } from './dialog';
import { FocusService } from './focus';

/** DialogSystem's connection — exported for stubs and the states file. */
export const connectDialogSystem = connect('DialogSystem', (c) => {
  const dialogService = c.service(DialogService);
  const focusService = c.service(FocusService);
  return view(
    { openId: dialogService.openId, entryVersion: dialogService.entryVersion },
    {
      close: dialogService.close,
      entry: () => dialogService.entry(),
      enterOverlay: focusService.enterOverlay,
      trapOverlayTab: focusService.trapOverlayTab
    }
  );
}, { group: 'framework' });

/** The one dialog host. Mount once inside the provider. */
export function DialogSystem(): JSX.Element {
  const state = connectDialogSystem({});
  let overlay: HTMLDivElement | undefined;

  // focus boundary: every entry revision receives a fresh overlay lifecycle,
  // including confirm → confirm where the public id does not change.
  createEffect(() => {
    state.entryVersion;
    if (!state.openId || !overlay) return;
    const leaveOverlay = state.enterOverlay(overlay);
    onCleanup(leaveOverlay);
  });

  return (
    <Show when={state.openId ? state.entryVersion : 0} keyed>
      {(_entryVersion: number) => {
        const entry = state.entry();
        if (!entry) return null;
        return (
          <Portal>
            <div
              use:componentRoot
              ref={overlay}
              data-testid="wheel-dialog-overlay"
              style={{
                position: 'fixed',
                inset: '0',
                background: 'var(--wheel-scrim, rgba(15,18,24,0.4))',
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                // ABOVE the command palette (9_500), because the palette is
                // what usually opens a dialog: "New issue" filed from the
                // palette drew its dialog UNDER the palette that launched
                // it. A dialog is a task the user has to finish; a launcher
                // must never cover the thing it launched. Still below
                // context menus (10_000) and toasts (12_000), which a
                // dialog's own content raises.
                'z-index': 9_600
              }}
              onClick={(event) => {
                if (event.target === event.currentTarget) state.close();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  state.close();
                  return;
                }
                if (state.trapOverlayTab(event.currentTarget, event)) {
                  event.stopPropagation();
                }
              }}
            >
              {entry.owner ? runWithOwner(entry.owner, () => entry.render()) : entry.render()}
            </div>
          </Portal>
        );
      }}
    </Show>
  );
}
