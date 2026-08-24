/**
 * Playground shell: the sidebar lists the registered sandboxes AND every
 * discovered component × state (from the `*.states.tsx` glob); the main
 * area mounts the selection. Hash routing, no router dependency:
 *
 *   #/<sandbox-id>                     a sandbox
 *   #/states/<Component>/<state>      one component state, URL-addressable —
 *                                     an agent screenshots any state by URL
 *
 * Switching entries unmounts the previous one (keyed Show), so each mount
 * starts fresh.
 */
import { For, Show, type JSX } from 'solid-js';
import { StateMount, useSignal, viewRoot, type AnyStatesDefinition } from 'wheel/core';

import { SANDBOXES, type Sandbox } from './sandboxes';
import { STATE_DEFINITIONS } from './states';

type Selection =
  | { readonly kind: 'sandbox'; readonly sandbox: Sandbox }
  | { readonly kind: 'state'; readonly definition: AnyStatesDefinition; readonly state: string };

const stateHash = (definition: AnyStatesDefinition, state: string): string =>
  `#/states/${encodeURIComponent(definition.name)}/${encodeURIComponent(state)}`;

function parseHash(): Selection {
  // wheel-raw-location: the playground is a bare component sandbox with no
  // provider tree, so there is no service container to resolve a router from.
  const hash = window.location.hash.replace(/^#\/?/, '');
  const stateMatch = /^states\/([^/]+)\/(.+)$/.exec(hash);
  if (stateMatch) {
    const definition = STATE_DEFINITIONS.find((entry) => entry.name === decodeURIComponent(stateMatch[1]));
    const state = decodeURIComponent(stateMatch[2]);
    if (definition && definition.states[state]) {
      return { kind: 'state', definition, state };
    }
  }
  const sandbox = SANDBOXES.find((entry) => entry.id === hash) ?? SANDBOXES[0];
  return { kind: 'sandbox', sandbox };
}

export function Harness(): JSX.Element {
  const [selection, setSelection] = useSignal<Selection>(parseHash(), 'selection');
  window.addEventListener('hashchange', () => setSelection(parseHash()));
  const selectedStateKey = (): string | null => {
    const current = selection();
    return current.kind === 'state' ? `${current.definition.name}/${current.state}` : null;
  };
  return (
    <div use:viewRoot={'Harness'} class="shell">
      <nav class="sidebar">
        <a class="brand" href={`#/${SANDBOXES[0].id}`}>
          wheel playground
        </a>
        <For each={SANDBOXES}>
          {(entry) => (
            <a
              href={`#/${entry.id}`}
              classList={{ active: selection().kind === 'sandbox' && (selection() as { sandbox?: Sandbox }).sandbox === entry }}
            >
              {entry.title}
            </a>
          )}
        </For>
        <div class="section-label">component states</div>
        <For each={STATE_DEFINITIONS}>
          {(definition) => (
            <div class="states-group">
              <div class="states-name">{definition.name}</div>
              <For each={Object.keys(definition.states)}>
                {(state) => (
                  <a
                    href={stateHash(definition, state)}
                    classList={{ active: selectedStateKey() === `${definition.name}/${state}` }}
                  >
                    {state}
                  </a>
                )}
              </For>
            </div>
          )}
        </For>
      </nav>
      <main class="content">
        <Show when={selection()} keyed>
          {(current) =>
            current.kind === 'sandbox' ? (
              <>
                <h1>{current.sandbox.title}</h1>
                <p class="sandbox-note">{current.sandbox.note}</p>
                <div class="sandbox-frame">{current.sandbox.mount()}</div>
              </>
            ) : (
              <>
                <h1>
                  {current.definition.name} · {current.state}
                </h1>
                <Show when={current.definition.states[current.state]?.note}>
                  {(note) => <p class="sandbox-note">{note()}</p>}
                </Show>
                <div class="sandbox-frame" data-testid="state-mount">
                  <StateMount definition={current.definition} state={current.state} />
                </div>
              </>
            )
          }
        </Show>
      </main>
    </div>
  );
}
