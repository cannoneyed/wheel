/**
 * The errors section: the capture buffer rendered for humans — level-colored
 * rows, expandable source-mapped stacks, ONE-CLICK COPY per entry (message +
 * mapped stack as a single pasteable block), and clear. Mounting it also
 * starts capture (idempotent), so any chrome that shows the section
 * guarantees the buffer exists.
 */
// wheel-view-root: debug chrome — must not appear in the tree it renders
// wheel-raw-signal: same reason — this chrome registers no instance, so a
// named signal would be recorded against whatever app component happens to
// be its nearest registered ancestor
import { createSignal, onCleanup, For, Show, type JSX } from 'solid-js';

import { startErrorCapture, formatEntry, type CapturedError } from './error-capture';
import { Expandable, sectionStyles, type ExpandState } from './panel-sections';

const LEVEL_COLORS: Record<string, string> = {
  error: 'var(--wheel-danger, #f87171)',
  warn: 'var(--wheel-warn, #fbbf24)',
  info: 'var(--wheel-stage-ink-faint, #8b8b8b)',
  debug: 'var(--wheel-stage-ink-faint, #8b8b8b)'
};

function copyEntry(entry: CapturedError): void {
  const text = formatEntry(entry);
  // Clipboard needs a secure context; fall back to a console drop so the
  // text is still one copy away.
  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard) {
    void clipboard.writeText(text);
  } else {
    // wheel-console: deliberate fallback surface when no clipboard exists.
    console.log(text);
  }
}

/** The errors buffer as a panel section (see module doc). */
export function ErrorSection(props: { ex: ExpandState }): JSX.Element {
  const log = startErrorCapture();
  const [revision, setRevision] = createSignal(0);
  onCleanup(log.subscribe(() => setRevision((value) => value + 1)));
  const entries = (): readonly CapturedError[] => {
    revision();
    return log.entries();
  };
  return (
    <>
      <div style={{ ...sectionStyles.paneTitle, display: 'flex', gap: '8px' }}>
        <span>errors ({entries().length})</span>
        <Show when={entries().length > 0}>
          <span
            style={{ cursor: 'pointer', 'text-transform': 'none' }}
            onClick={() => log.clear()}
            data-testid="wheel-errors-clear"
          >
            clear
          </span>
        </Show>
      </div>
      <Show when={entries().length > 0} fallback={<div style={sectionStyles.dim}>no captured errors</div>}>
        <For each={entries()}>
          {(entry) => (
            <div data-testid="wheel-error-entry">
              <Expandable
                path={`error:${entry.id}`}
                label={`${entry.id} · ${entry.message.slice(0, 80)}`}
                summary={`${entry.level}${entry.mapped ? '' : entry.stack.length > 0 ? ' (unmapped)' : ''}`}
                ex={props.ex}
              >
                <div style={{ color: LEVEL_COLORS[entry.level] ?? 'var(--wheel-stage-ink-faint, #8b8b8b)' }}>
                  {entry.level.toUpperCase()} ({entry.source}) {entry.message}
                </div>
                <For each={entry.stack}>
                  {(frame) => <div style={sectionStyles.dim}>{frame}</div>}
                </For>
                <button
                  type="button"
                  style={{
                    'margin-top': '4px',
                    padding: '1px 7px',
                    color: 'var(--wheel-stage-ink-faint, #8b93a3)',
                    background: 'none',
                    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
                    'border-radius': '5px',
                    cursor: 'pointer',
                    font: 'inherit'
                  }}
                  onClick={() => copyEntry(entry)}
                  data-testid="wheel-error-copy"
                >
                  copy
                </button>
              </Expandable>
            </div>
          )}
        </For>
      </Show>
    </>
  );
}
