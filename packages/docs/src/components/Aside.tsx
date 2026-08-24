/**
 * Callout blocks for MDX pages. `kind="todo"` marks work that does not exist
 * yet — every unbuilt feature in the docs must sit inside one of these so a
 * reader never mistakes a plan for a shipped thing. `kind="warning"` marks a
 * shipped footgun: code that compiles and looks right, then breaks somewhere
 * far from where it was written.
 */
import type { JSX } from 'solid-js';
import { viewRoot } from 'wheel/core';

type AsideKind = 'note' | 'todo' | 'warning';

const LABELS: Record<AsideKind, string> = {
  note: 'Note',
  todo: 'TODO — not built yet',
  warning: 'Warning'
};

export function Aside(props: { kind?: AsideKind; children: JSX.Element }) {
  const kind = () => props.kind ?? 'note';
  return (
    <div use:viewRoot={{ name: 'Aside', props }} class={`aside ${kind()}`}>
      <span class="aside-label">{LABELS[kind()]}</span>
      {props.children}
    </div>
  );
}
