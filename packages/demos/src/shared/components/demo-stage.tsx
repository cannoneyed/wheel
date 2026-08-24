/**
 * The staged-artifact frame every sync demo mounts into.
 *
 * One seamed card, framing's move applied to the demos: the card draws the
 * border once, and the rows inside it draw only the seams between them.
 *
 *   ┌──────────────────────────────────────────┐
 *   │ TODOS        latency ▾        ● connected│  .demo-header  (instrument)
 *   ├──────────────────────────────────────────┤
 *   │ ↶ ↷  🗑 2 selected                       │  .demo-toolbar (when given)
 *   ├──────────────────────────────────────────┤
 *   │ the demo itself                          │  .demo-stage-body
 *   └──────────────────────────────────────────┘
 *
 * The header is `ConnectionPanel`, unchanged — including its contract that
 * controls RENDER CONSTANTLY and disable rather than appear and disappear, so
 * nothing below them ever shifts. This component only wraps it and gives the
 * demo body a home.
 *
 * The demo's own interior is NOT restyled to match: the chrome is the shared
 * part, the artifact on the stage stays whatever the demo is.
 */
import type { JSX } from 'solid-js';
import { viewRoot } from 'wheel/core';

import { ConnectionPanel } from './connection-panel';

/** Instrument header (+ optional toolbar row) above the demo's own UI. */
export function DemoStage(props: {
  title: string;
  toolbar?: JSX.Element;
  children?: JSX.Element;
}): JSX.Element {
  return (
    <section use:viewRoot={{ name: 'DemoStage', props }} class="demo-stage">
      <ConnectionPanel title={props.title}>{props.toolbar}</ConnectionPanel>
      <div class="demo-stage-body">{props.children}</div>
    </section>
  );
}
