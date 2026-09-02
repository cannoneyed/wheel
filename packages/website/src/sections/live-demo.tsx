/**
 * The live figure: two clients, one server, both on this page.
 *
 * Each pane is a full wheel app — its own `SyncClient`, its own services, its
 * own optimistic writes — and both are peers of one in-browser sync engine
 * (see `live-client.ts`). The todo list inside them is the demos' `TodoList`,
 * imported unchanged, which is the claim the section makes: a component built
 * for one app drops into another with no adapter.
 *
 * No `KeyboardSystem` here, deliberately: it binds a document-level keydown
 * listener, so two panes would put two of them on a page someone is reading —
 * and `n` would yank the reader into a todo input mid-paragraph. The panes
 * pass their own input placeholder for the same reason.
 *
 * The switch cuts one pane's wire. Typing while unplugged still works, because
 * the client answers from its own state and queues the writes; plugging back
 * in releases the queue and both panes converge. Nothing about that path is
 * special-cased for the demo — it is the same code a deployed app runs when a
 * phone goes through a tunnel.
 */
import { For, Show } from 'solid-js';
import { ContextMenuSystem, DialogSystem } from 'wheel/kit';
import { Switch } from 'wheel/components';
import { WheelApp } from 'wheel/debug';
import { useSignal, viewRoot } from 'wheel/core';

import { TodoList } from '../../../demos/src/todos/components/todo-list';
import { livePeer } from './live-client';

const PANES = [
  { id: 'a', label: 'Client A' },
  { id: 'b', label: 'Client B' }
] as const;

/** One pane: header strip with the unplug switch, then the app itself. */
function LiveDemoPane(props: { id: string; label: string }) {
  const peer = livePeer(props.id);
  // Mirrors the switch position for the UI. The transport wrapper owns the
  // real wire state; this is the checkbox, not the source of truth.
  const [online, setOnline] = useSignal(true, 'online');
  const flip = (next: boolean) => {
    setOnline(next);
    peer.control.setOffline(!next);
  };
  return (
    <section use:viewRoot={{ name: 'LiveDemoPane', props }} class="live-pane">
      <header class="live-pane-head">
        <span class="live-pane-name">{props.label}</span>
        <label class="live-pane-switch">
          <Switch.Root
            data-wheel-role="connection"
            checked={online()}
            onCheckedChange={(next: boolean) => flip(next)}
            aria-label={`${props.label} connection`}
          >
            <Switch.Thumb />
          </Switch.Root>
          <span classList={{ 'live-offline': !online() }}>{online() ? 'online' : 'offline'}</span>
        </label>
      </header>
      <div class="live-pane-body">
        <WheelApp client={peer.client}>
          <TodoList placeholder="Add a todo…" />
          <ContextMenuSystem />
          <DialogSystem />
        </WheelApp>
      </div>
    </section>
  );
}

/**
 * The figure. `label` is an ordinary heading, one step under the section's own
 * — the block used to open with an uppercase mono "LIVE DEMO | RUNNING IN THIS
 * TAB" caption, which was the only thing on the page still wearing that
 * treatment once the section eyebrows came off. The children are the caption
 * copy, authored in `home.mdx` like every other word on the page.
 */
export function LiveDemo(props: { label: string; children?: unknown }) {
  // Booting WASM SQLite in a worker takes a beat; the panes mount as soon as
  // the module loads and show their own loading state, so there is nothing to
  // gate here.
  return (
    <div use:viewRoot={{ name: 'LiveDemo', props }} class="live-demo" data-testid="live-demo">
      <h3 class="live-demo-title">{props.label}</h3>
      <Show when={props.children}>
        <div class="live-demo-caption">{props.children as never}</div>
      </Show>
      <div class="live-panes">
        <For each={PANES}>{(pane) => <LiveDemoPane id={pane.id} label={pane.label} />}</For>
      </div>
      <p class="live-demo-note">
        No server. Both panes talk to a wheel sync engine on WASM SQLite in a worker in this tab —
        the same engine a Durable Object runs.
      </p>
    </div>
  );
}
