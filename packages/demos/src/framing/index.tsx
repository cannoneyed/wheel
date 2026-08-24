/**
 * The framing kitchen sink: one VS Code-shaped shell exercising every part of
 * the v3 surface — nested splits, collapse (manual and responsive), a drawer,
 * drag-reordered panes, a docking workspace, and the observable service behind
 * all of it.
 *
 * Read `workbench.tsx` first: it is the entire layout, and it is just JSX.
 */
import type { JSX } from 'solid-js';
import { ContextMenuSystem } from 'wheel/kit';
import { viewRoot } from 'wheel/core';

import { FramingControls } from './controls';
import styles from './framing.module.css';
import { LayoutInspector } from './layout-inspector';
import { FramingStage } from './stage';

/** The `/framing` route: hero, controls, stage, and the live state table. */
export function FramingDemo(): JSX.Element {
  return (
    <section use:viewRoot={'FramingDemo'} class={styles.demo} data-testid="framing-demo">
      <header class={styles.hero}>
        <div>
          <span class={styles.eyebrow}>wheel / kit / framing</span>
          <h1>Application framing kitchen sink</h1>
          <p>
            Your app owns structure; framing owns geometry. Every region below is
            a <code>Frame.Row</code> or <code>Frame.Column</code> with an id —
            and from that id alone it gets resize handles, min/max clamping,
            collapse, persistence, and a live record in
            <code> LayoutService</code>.
          </p>
        </div>
        <div class={styles.heroBadges} aria-label="Framing capabilities">
          <span>Nested splits</span>
          <span>Gesture machines</span>
          <span>Responsive collapse</span>
          <span>Docking intents</span>
        </div>
      </header>

      <ContextMenuSystem />
      <FramingControls />
      <FramingStage />
      <LayoutInspector />

      <div class={styles.featureTour}>
        <article>
          <span>01</span>
          <div>
            <strong>Resize every divider</strong>
            <p>
              Drag any handle with mouse, pen, or touch. Or focus one and use
              ArrowLeft/Right (Shift for coarse steps), Home, End, Enter to
              collapse, Escape to cancel, double-click to reset the pair.
            </p>
          </div>
        </article>
        <article>
          <span>02</span>
          <div>
            <strong>Reorder panes by dragging them</strong>
            <p>
              Drag an editor by the ⠿ grip in its header. Framing runs the
              gesture and reports the new id order; the demo service applies it
              to its list, and the <code>&lt;For&gt;</code> re-renders.
            </p>
          </div>
        </article>
        <article>
          <span>03</span>
          <div>
            <strong>Dock a panel onto another&apos;s edge</strong>
            <p>
              Drag a bottom-panel grip over another panel and release near an
              edge. The split that appears exists in the demo&apos;s own JSON
              atom — <code>applyDockIntent</code> put it there.
            </p>
          </div>
        </article>
        <article>
          <span>04</span>
          <div>
            <strong>Reload, and shrink the stage</strong>
            <p>
              Sizes and open state come back by frame id. Narrow the stage and
              the sidebar collapses on its own — flipping <code>visible</code>,
              never <code>open</code>.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
