/**
 * Editor demo — ONE tiptap editor whose blocks are synced wheel rows. Open
 * two windows: typing converges on ~800ms pauses, structure changes (Enter
 * splits, Backspace merges, kind changes) are mutations the moment they
 * happen, presence dots mark peers' blocks, and undo/redo replay inverse
 * mutations so history syncs everywhere like any other write. Hardened
 * surfaces: markdown prefixes + a `/` menu, mod+z through wheel (D1), a
 * per-block context menu, and confirmed deletes. Composition only — each
 * connected component lives in its own file.
 */
import { ContextMenuSystem, DialogSystem, KeyboardSystem } from 'wheel/kit';
import { WheelApp } from 'wheel/debug';
import { DocumentEditor, HistoryControls } from 'wheel-chalk';

import { demoClient } from '../shared/utils/demo-client';
import { DemoStage } from '../shared/components/demo-stage';

/** The demo root the shell mounts. */
export function EditorDemo() {
  return (
    <WheelApp client={demoClient('editor')}>
      <DemoStage title="Editor" toolbar={<HistoryControls />}>
        <DocumentEditor />
      </DemoStage>
      <KeyboardSystem />
      <ContextMenuSystem />
      <DialogSystem />
    </WheelApp>
  );
}
