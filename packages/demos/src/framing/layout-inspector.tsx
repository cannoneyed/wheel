/**
 * Every frame on screen, as live state.
 *
 * Nothing here is a layout-specific debugging API. Mounting a frame creates a
 * node in `LayoutService`, so the inspector is an ordinary connected component
 * reading ordinary observable values — the same ones the debug graph shows.
 *
 * Watch the `open` and `visible` columns together: shrink the stage until the
 * sidebar auto-collapses and `visible` flips to `hidden` while `open` stays
 * `open`. Responsive behaviour never overwrites what the user asked for.
 */
import { For, type JSX } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { LayoutService } from 'wheel/kit';

import styles from './framing.module.css';

/** The root of the demo's split tree; drawers live outside it. */
const ROOT_FRAME = 'shell';
/** Registered frames that are never children of a split. */
const UNPARENTED_FRAMES = ['inspector-drawer'];

interface FrameRowVm {
  readonly id: string;
  readonly depth: number;
  readonly kind: string;
  readonly open: boolean;
  readonly visible: boolean;
  readonly size: string;
  readonly pixels: string;
  readonly dragging: boolean;
}

/** Walk the live registration graph: root first, then reported child order. */
function describeFrames(layout: LayoutService): readonly FrameRowVm[] {
  const rows: FrameRowVm[] = [];
  const visit = (id: string, depth: number): void => {
    const node = layout.node(id);
    if (!node) return;
    rows.push({
      id,
      depth,
      kind: node.kind,
      open: node.open,
      visible: node.visible,
      size: node.size,
      pixels: node.pixels
        ? `${node.pixels.inlineSize}×${node.pixels.blockSize}`
        : '—',
      dragging: node.dragging
    });
    for (const child of layout.childOrder(id)) visit(child, depth + 1);
  };
  visit(ROOT_FRAME, 0);
  for (const id of UNPARENTED_FRAMES) visit(id, 1);
  return rows;
}

const connectLayoutInspector = connect('LayoutInspector', (c) => {
  const layout = c.service(LayoutService);
  return view({
    frames: () => describeFrames(layout),
    interaction: layout.interaction,
    diagnostics: layout.diagnostics
  });
});

/** Live table of every registered frame, plus the service's diagnostics. */
export function LayoutInspector(): JSX.Element {
  const state = connectLayoutInspector({});
  const interactionLabel = (): string => {
    const draft = state.interaction;
    return draft === null
      ? 'idle'
      : `${draft.kind} ${draft.beforeId} ⇄ ${draft.afterId}`;
  };
  return (
    <aside
      use:componentRoot
      class={styles.layoutInspector}
      data-testid="layout-inspector"
      aria-label="Observable layout state"
    >
      <div class={styles.inspectorHeading}>
        <div>
          <span class={styles.liveDot} />
          Observable frame state
        </div>
        <code data-testid="frame-count">{state.frames.length} frames</code>
      </div>

      <div class={styles.frameTable} role="table">
        <div class={styles.frameHead} role="row">
          <span role="columnheader">frame</span>
          <span role="columnheader">kind</span>
          <span role="columnheader">open</span>
          <span role="columnheader">visible</span>
          <span role="columnheader">size</span>
          <span role="columnheader">pixels</span>
        </div>
        <For each={state.frames}>
          {(frame) => (
            <div
              class={styles.frameRow}
              role="row"
              data-testid={`frame-row-${frame.id}`}
              data-dragging={frame.dragging ? 'true' : undefined}
            >
              <code style={{ 'padding-left': `${frame.depth * 12}px` }}>
                {frame.id}
              </code>
              <span>{frame.kind}</span>
              <code data-testid={`frame-open-${frame.id}`}>
                {frame.open ? 'open' : 'closed'}
              </code>
              <code
                class={frame.visible ? styles.visibleState : styles.hiddenState}
                data-testid={`frame-visible-${frame.id}`}
              >
                {frame.visible ? 'visible' : 'hidden'}
              </code>
              <code data-testid={`frame-size-${frame.id}`}>{frame.size}</code>
              <code data-testid={`frame-pixels-${frame.id}`}>
                {frame.pixels}
              </code>
            </div>
          )}
        </For>
      </div>

      <div class={styles.interactionState}>
        <span>Interaction</span>
        <code data-testid="layout-interaction">{interactionLabel()}</code>
        <span>Diagnostics</span>
        <code data-testid="layout-diagnostics">
          {state.diagnostics.length === 0
            ? 'none'
            : state.diagnostics.map((entry) => entry.message).join(' · ')}
        </code>
      </div>
    </aside>
  );
}
