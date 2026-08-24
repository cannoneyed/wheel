/**
 * The stage the workbench lives on, plus the width control that shrinks it.
 *
 * Shrinking the stage is how the responsive rule becomes visible without
 * resizing the browser: below 760px the sidebar's `collapseBelow` flips its
 * EFFECTIVE visibility while leaving the user's `open` choice alone. Widen the
 * stage and the sidebar comes back at its remembered width.
 */
import type { JSX } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import styles from './framing.module.css';
import { WorkbenchService } from './services/workbench-service';
import { FramingWorkbench } from './workbench';

const connectFramingStage = connect('FramingStage', (c) => {
  const workbench = c.service(WorkbenchService);
  return view(
    { stageWidth: workbench.stageWidth },
    { setStageWidth: workbench.setStageWidth }
  );
});

/** Container-width slider above a fixed-height stage holding the workbench. */
export function FramingStage(): JSX.Element {
  const state = connectFramingStage({});
  return (
    <div use:componentRoot class={styles.stageArea}>
      <div class={styles.containerControls}>
        <label>
          <span>
            Container width
            <output data-testid="stage-width">{state.stageWidth}px</output>
          </span>
          <input
            type="range"
            min="560"
            max="1100"
            step="10"
            value={state.stageWidth}
            data-testid="container-width"
            onInput={(event) =>
              state.setStageWidth(event.currentTarget.valueAsNumber)
            }
          />
        </label>
        <span>
          Under 760px the sidebar collapses itself — <code>visible</code> flips,
          <code> open</code> never does.
        </span>
      </div>
      <div class={styles.stageRail}>
        <div
          class={styles.stage}
          data-testid="framing-stage"
          style={{ 'max-width': `${state.stageWidth}px` }}
        >
          <FramingWorkbench />
        </div>
      </div>
    </div>
  );
}
