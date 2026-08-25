/**
 * Small interactive state inspector for the landing page. The entries and
 * every visible label come from home.mdx; this file owns only interaction.
 */
import { For } from 'solid-js';
import { useSignal, viewRoot } from 'wheel/core';

export interface DebugPreviewEntry {
  name: string;
  value: string;
  write: string;
  readers: string;
}

export function DebugPanelPreview(props: {
  title: string;
  status: string;
  stateLabel: string;
  valueLabel: string;
  writeLabel: string;
  readersLabel: string;
  entries: DebugPreviewEntry[];
}) {
  const [selectedName, setSelectedName] = useSignal(props.entries[0]?.name ?? '', 'selectedName');
  const selected = () =>
    props.entries.find((entry) => entry.name === selectedName()) ?? props.entries[0]!;

  return (
    <figure
      use:viewRoot={{ name: 'DebugPanelPreview', props }}
      class="debug-preview"
      data-testid="debug-preview"
    >
      <header class="debug-preview-header">
        <span class="debug-preview-title">{props.title}</span>
        <span class="debug-preview-status">{props.status}</span>
      </header>
      <div class="debug-preview-body">
        <div class="debug-preview-state">
          <div class="debug-preview-columns" aria-hidden="true">
            <span>{props.stateLabel}</span>
            <span>{props.valueLabel}</span>
          </div>
          <div class="debug-preview-rows">
            <For each={props.entries}>
              {(entry) => (
                <button
                  type="button"
                  class="debug-preview-row"
                  classList={{ active: selectedName() === entry.name }}
                  aria-pressed={selectedName() === entry.name}
                  onClick={() => setSelectedName(entry.name)}
                >
                  <span>{entry.name}</span>
                  <code>{entry.value}</code>
                </button>
              )}
            </For>
          </div>
        </div>
        <dl class="debug-preview-trace">
          <div>
            <dt>{props.writeLabel}</dt>
            <dd><code>{selected().write}</code></dd>
          </div>
          <div>
            <dt>{props.readersLabel}</dt>
            <dd>{selected().readers}</dd>
          </div>
        </dl>
      </div>
    </figure>
  );
}
