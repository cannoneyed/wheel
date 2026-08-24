/**
 * The Axle shell: sidebar + routed main pane + global systems.
 *
 * The layout IS this JSX: a `Frame.Row` with a pixel-sized sidebar column and
 * a fractional routed column. Every frame registers with the kit
 * `LayoutService` by id, which is what makes the sidebar resizable,
 * persistent, and auto-collapsing on a narrow window with nothing else wired.
 *
 * The routed half is `<trackerRouter.Root/>`, which renders `RoutedMain` and
 * whatever route is nested inside it.
 */
import {
  CommandPaletteSystem,
  ContextMenuSystem,
  Dialog,
  DialogSystem,
  Frame,
  KeyboardSystem,
  ToastSystem
} from 'wheel/kit';
import { viewRoot } from 'wheel/core';

import { trackerRouter } from '../../routes';
import { Sidebar } from '../sidebar/sidebar';
import { PickerOverlay } from '../common/picker-overlay';
import { SearchOverlay } from '../common/search-overlay';
import { ShortcutsDialog } from '../common/shortcuts-dialog';
import { SHORTCUTS_DIALOG_ID } from '../../services/issue-interaction-service';
import styles from './app-shell.module.css';

/** The whole app under the provider (mounted by main.tsx). */
export function AppShell() {
  return (
    <div use:viewRoot={'AppShell'} class={styles.shell}>
      <Frame.Row id="tracker-shell" class={styles.frame}>
        <Frame.Column
          id="tracker-sidebar"
          size="240px"
          minSize="180px"
          maxSize="440px"
          collapseBelow="760px"
        >
          <Sidebar />
        </Frame.Column>
        <Frame.Column id="tracker-route" size="1fr" minSize="360px">
          <trackerRouter.Root />
        </Frame.Column>
      </Frame.Row>
      <KeyboardSystem />
      <ContextMenuSystem />
      <DialogSystem />
      <CommandPaletteSystem />
      <PickerOverlay />
      <SearchOverlay />
      <Dialog id={SHORTCUTS_DIALOG_ID} content={() => <ShortcutsDialog />} />
      <ToastSystem />
    </div>
  );
}
