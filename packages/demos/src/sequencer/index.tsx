/**
 * Sequencer demo — the bridge to imperative TIME. A collaborative sixteen-step
 * drum machine on the WebAudio clock, wrapped by wheel. (Its sibling, the
 * graph demo, bridges imperative SPACE: a three.js render loop.)
 *
 * The one paragraph worth remembering: THE PATTERN SYNCS, THE PLAYHEAD DOES
 * NOT. Which cells are lit, how hard they hit, what the lanes are called and
 * how fast the whole thing runs are synced rows any peer can edit and undo.
 * Whether YOUR browser is currently making sound is not — a browser will not
 * start audio until the person in front of it has clicked something, so two
 * windows keep independent playheads over one shared pattern. That is the
 * right answer, not a limitation: the pattern is the document, the playhead is
 * how you are listening to it.
 *
 * Open two windows: edits appear in both instantly, the cell each peer last
 * touched glows in their color, and the toolbar counts who else has their own
 * loop running. The debug panel shows the same pattern as named rows while
 * the highlight walks across the grid.
 *
 * No audio files: all four voices are synthesized (audio/engine.ts), so the
 * whole demo works unchanged inside the website's static /demos embed.
 */
import { viewRoot } from 'wheel/core';
import { ContextMenuSystem, DialogSystem, KeyboardSystem } from 'wheel/kit';
import { WheelApp } from 'wheel/debug';
import { WheelAnnotate } from 'wheel/annotate';

import { demoClient } from '../shared/utils/demo-client';
import { DemoStage } from '../shared/components/demo-stage';
import { SequencerGrid } from './components/sequencer-grid';
import { SequencerToolbar } from './components/sequencer-toolbar';
import { SequencerTracks } from './components/sequencer-tracks';
import styles from './sequencer.module.css';

/** The demo root the shell mounts. */
export function SequencerDemo() {
  return (
    <WheelApp client={demoClient('sequencer')}>
      <DemoStage title="Sequencer" toolbar={<SequencerToolbar />}>
        <div use:viewRoot={'SequencerDemo'} class={styles.layout}>
          <SequencerGrid />
          <SequencerTracks />
        </div>
      </DemoStage>
      <KeyboardSystem />
      <ContextMenuSystem />
      <DialogSystem />
      <WheelAnnotate />
    </WheelApp>
  );
}
