/**
 * The shared connection box every demo mounts: a TWO-row header.
 *
 * It is the instrument panel at the top of the staged card — `DemoStage`
 * mounts it and puts the demo itself underneath. Nothing here knows about the
 * card; the two rows work the same standing alone.
 *
 * Row 1 is app metadata ONLY — title, latency control, and the sync badge
 * pinned to the right edge. The badge's chips ("N in flight", "✓ synced")
 * grow leftward into empty space, so nothing in the row ever shifts.
 *
 * Row 2 is the demo's toolbar (`children`): undo/redo, bulk delete, whatever
 * the demo needs. Controls here should render CONSTANTLY (disabled when
 * inapplicable) rather than appear/disappear — same no-layout-shift rule,
 * one row down.
 */
import { Show, children as resolveChildren, type JSX } from 'solid-js';
import { viewRoot } from 'wheel/core';

import { ToastSystem } from 'wheel/kit';

import { SyncBadge } from './sync-badge';
import { LatencyControl } from './latency-control';
import { SyncActivity } from './sync-activity';

/** Metadata row + optional toolbar row + toasts. Mount once inside each demo's provider. */
export function ConnectionPanel(props: { title: string; children?: JSX.Element }): JSX.Element {
  const toolbar = resolveChildren(() => props.children);
  return (
    <>
      <header use:viewRoot={{ name: 'ConnectionPanel', props }} class="demo-header">
        <h1>{props.title}</h1>
        <LatencyControl />
        <SyncBadge />
      </header>
      <Show when={toolbar()}>
        <div class="demo-toolbar">{toolbar()}</div>
      </Show>
      <SyncActivity />
      <ToastSystem />
    </>
  );
}
