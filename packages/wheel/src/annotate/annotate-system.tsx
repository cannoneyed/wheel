/**
 * `<AnnotateChrome/>` — everything you SEE when annotation mode is armed.
 *
 * This module is the lazy half. `WheelAnnotate` (annotate-lazy.tsx) imports it
 * dynamically the first time someone arms, so a production bundle carries the
 * recorder and a chip rather than the picker, the composer, voice capture and
 * note rendering. Measured on the tracker: 8.1 KB gzipped stays out of the
 * main bundle this way.
 *
 * Armed, it renders pins for existing notes, a picker that highlights the
 * component under the cursor, and a toolbar with the other capture modes.
 *
 * The picker's shield swallows every press, so it steps aside while a clip is
 * recording — a clip is made by USING the app.
 *
 * Click a component and the composer opens, already holding that component's
 * live state, its screenshot, and its place in the tree. Type or talk, press
 * save, and a directory lands under `.wheel/notes/` with the read-this-file
 * command on your clipboard.
 *
 * The chrome is deliberately independent of the debug panel: a production
 * build can mount this alone, and nothing here assumes the panel exists.
 */
// wheel-component-root: annotation chrome — must never appear in its own picks
// wheel-view-root: annotation chrome — must not appear in the tree it annotates
// wheel-untracked-show: annotation chrome — excluded from the component tree
// wheel-raw-signal: this chrome registers no instance, so a named signal would
// be recorded against whatever app component happens to be its nearest
// registered ancestor
import { For, Show, createEffect, createSignal, onCleanup, useContext, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

import { WheelContext } from '../core/context';
import type { SyncClient } from '../sync/client/client';
import { captureViewportRegion, tabCaptureStream } from '../debug/snapshot';

import { AnnotateService, type SavedNote } from './annotate-service';
import { describeElement } from './anchor';
import { describeEvent } from './note-format';
import { speechRecognitionAvailable } from './media';
import type { NoteLabel, NoteRect } from './types';

/** Above the app, below the debug panel's own chrome. */
const LAYER = 10_400;

/** The labels a note can carry, in the order they appear in the composer. */
const LABELS: readonly NoteLabel[] = ['bug', 'question', 'idea', 'todo', 'looks-good'];

const styles = {
  chip: {
    position: 'fixed',
    left: '12px',
    bottom: '12px',
    'z-index': LAYER + 2,
    display: 'flex',
    'align-items': 'center',
    gap: '6px',
    padding: '4px 10px',
    'border-radius': '999px',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    background: 'var(--wheel-stage-2, #101317)',
    color: 'var(--wheel-stage-ink, #d7d3cc)',
    font: '12px ui-monospace, monospace',
    cursor: 'pointer'
  },
  toolbar: {
    position: 'fixed',
    left: '12px',
    bottom: '48px',
    'z-index': LAYER + 2,
    display: 'flex',
    'flex-direction': 'column',
    gap: '4px',
    padding: '6px',
    'border-radius': '10px',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    background: 'var(--wheel-stage-2, #101317)',
    color: 'var(--wheel-stage-ink, #d7d3cc)',
    font: '12px ui-monospace, monospace'
  },
  button: {
    padding: '3px 8px',
    'text-align': 'left',
    color: 'inherit',
    background: 'none',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    'border-radius': '6px',
    cursor: 'pointer',
    font: 'inherit'
  },
  shield: {
    position: 'fixed',
    inset: '0',
    'z-index': LAYER,
    cursor: 'crosshair'
  },
  outline: {
    position: 'fixed',
    'z-index': LAYER + 1,
    border: '2px solid var(--wheel-indigo-bright, #6366f1)',
    'border-radius': '3px',
    'pointer-events': 'none'
  },
  hint: {
    position: 'fixed',
    top: '14px',
    left: '50%',
    transform: 'translateX(-50%)',
    'z-index': LAYER + 2,
    padding: '6px 14px',
    'border-radius': '8px',
    background: 'var(--wheel-stage-4, #1a1d23)',
    color: 'var(--wheel-stage-ink-strong, #e5e7eb)',
    font: '12px ui-monospace, monospace'
  },
  band: {
    position: 'absolute',
    border: '1px dashed var(--wheel-indigo-bright, #6366f1)',
    // wheel-color: the marquee fill must stay translucent over the page it selects
    background: 'rgba(99,102,241,0.12)',
    'pointer-events': 'none'
  },
  composer: {
    position: 'fixed',
    left: '12px',
    bottom: '48px',
    width: '340px',
    'max-height': '70vh',
    overflow: 'auto',
    'z-index': LAYER + 3,
    display: 'flex',
    'flex-direction': 'column',
    gap: '8px',
    padding: '10px',
    'border-radius': '10px',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    background: 'var(--wheel-stage-2, #101317)',
    color: 'var(--wheel-stage-ink, #d7d3cc)',
    font: '12px ui-monospace, monospace'
  },
  textarea: {
    width: '100%',
    'min-height': '72px',
    resize: 'vertical',
    padding: '6px',
    'border-radius': '6px',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    background: 'var(--wheel-stage-1, #0b0d10)',
    color: 'inherit',
    font: 'inherit'
  },
  row: { display: 'flex', gap: '6px', 'flex-wrap': 'wrap', 'align-items': 'center' },
  dim: { color: 'var(--wheel-stage-ink-faint, #8b8b8b)', 'word-break': 'break-word' },
  pin: {
    position: 'fixed',
    'z-index': LAYER + 1,
    width: '18px',
    height: '18px',
    'border-radius': '999px',
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    background: 'var(--wheel-amber-bright, #f59e0b)',
    color: 'var(--wheel-stage-1, #0b0d10)',
    font: '10px ui-monospace, monospace',
    cursor: 'pointer'
  },
  preview: {
    'max-width': '100%',
    'border-radius': '4px',
    border: '1px solid var(--wheel-stage-line-strong, #2a2f3a)'
  }
} satisfies Record<string, JSX.CSSProperties>;

/** A rect as fixed-position style properties. */
function rectStyle(rect: NoteRect): JSX.CSSProperties {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  };
}

/**
 * Mount the annotation chrome. The chip lives in the stub that loaded this
 * module, so everything here is the armed experience.
 */
export function AnnotateChrome(): JSX.Element {
  const context = useContext(WheelContext);
  if (!context) return null;
  const service = context.services.get(AnnotateService);
  service.attach(context.client as SyncClient | null, {
    region: (rect) =>
      captureViewportRegion({ left: rect.x, top: rect.y, width: rect.width, height: rect.height }),
    stream: () => tabCaptureStream()
  });

  // listener boundary: the arming chord is a global shortcut, so it binds to
  // the document rather than to any element the annotator renders.
  createEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'a' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (service.mode.get() === 'off') service.arm();
        else service.disarm();
        return;
      }
      if (event.key === 'Escape' && service.mode.get() !== 'off') {
        event.preventDefault();
        if (service.mode.get() === 'composing') service.discard();
        else service.disarm();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  // The stub mounts this module only after someone armed, so arming here is
  // what "the chunk arrived" means. beginSession is idempotent: the rolling
  // buffer is normally already running by now.
  service.beginSession();
  service.arm();
  onCleanup(() => service.endSession());

  return (
    <Portal>
      <button
        type="button"
        style={styles.chip}
        data-testid="wheel-annotate-chip"
        title="Annotate this page (⌘⇧A)"
        onClick={() => (service.mode.get() === 'off' ? service.arm() : service.disarm())}
      >
        <span>✎</span>
        <Show when={service.recording.get()}>
          <span>● rec</span>
        </Show>
      </button>
      <Show when={service.mode.get() === 'armed'}>
        <Toolbar service={service} />
        {/* No picker while recording: a clip is made by USING the app, and the
            picker's shield deliberately swallows every press. */}
        <Show when={!service.recording.get()}>
          <Picker service={service} />
        </Show>
      </Show>
      <Show when={service.mode.get() !== 'off'}>
        <Pins service={service} />
      </Show>
      <Show when={service.mode.get() === 'region'}>
        <RegionOverlay service={service} />
      </Show>
      <Show when={service.mode.get() === 'composing'}>
        <Composer service={service} />
      </Show>
    </Portal>
  );
}

/** The armed-mode toolbar: the capture modes that are not "click a component". */
function Toolbar(props: { service: AnnotateService }): JSX.Element {
  return (
    <div style={styles.toolbar} data-testid="wheel-annotate-toolbar">
      <button type="button" style={styles.button} onClick={() => props.service.startRegion()}>
        ◰ region
      </button>
      <button type="button" style={styles.button} onClick={() => props.service.pickPage()}>
        ▭ page note
      </button>
      <Show
        when={props.service.recording.get()}
        fallback={
          <button
            type="button"
            style={styles.button}
            data-testid="wheel-annotate-record"
            onClick={() => props.service.startClip()}
          >
            ● record
          </button>
        }
      >
        <button
          type="button"
          style={styles.button}
          data-testid="wheel-annotate-stop"
          onClick={() => props.service.stopClip()}
        >
          ■ stop
        </button>
      </Show>
      <button type="button" style={styles.button} onClick={() => props.service.saveRetro()}>
        ⏮ last minute
      </button>
      <Show when={props.service.recording.get()}>
        <span style={styles.dim}>use the app, then press stop</span>
      </Show>
    </div>
  );
}

/**
 * The component picker: a shield over the page so a press reaches the picker
 * and never the UI beneath it, plus an outline on whatever is under the cursor.
 */
function Picker(props: { service: AnnotateService }): JSX.Element {
  const [rect, setRect] = createSignal<NoteRect | null>(null);
  const [label, setLabel] = createSignal('');

  const under = (x: number, y: number): Element | null => {
    const shield = document.querySelector('[data-testid="wheel-annotate-shield"]');
    const previous = shield instanceof HTMLElement ? shield.style.pointerEvents : null;
    if (shield instanceof HTMLElement) shield.style.pointerEvents = 'none';
    const element = document.elementFromPoint(x, y);
    if (shield instanceof HTMLElement && previous !== null) shield.style.pointerEvents = previous;
    return element;
  };

  const track = (event: PointerEvent): void => {
    const element = under(event.clientX, event.clientY);
    const record = element ? props.service.instanceAt(element) : null;
    if (!record) {
      // Still highlight it: on a page wheel does not own, the element IS the
      // target, and a picker that lights up nothing looks broken.
      props.service.hover(null);
      setLabel(element ? describeElement(element) : '');
      const bare = element?.getBoundingClientRect();
      setRect(bare ? { x: bare.x, y: bare.y, width: bare.width, height: bare.height } : null);
      return;
    }
    props.service.hover(record.instanceId);
    setLabel(record.instanceId);
    const box = [...record.elements].find((el) => el.isConnected)?.getBoundingClientRect();
    setRect(box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null);
  };

  return (
    <>
      <div
        style={styles.shield}
        data-testid="wheel-annotate-shield"
        onPointerMove={track}
        onClick={(event) => {
          const element = under(event.clientX, event.clientY);
          const record = element ? props.service.instanceAt(element) : null;
          if (record) props.service.pickInstance(record.instanceId);
          // No component claims it — a docs paragraph, a landing headline.
          // Anchor to the element itself rather than shrugging at the page.
          else if (element) props.service.pickElement(element);
          else props.service.pickPage();
        }}
      />
      <Show when={rect()}>{(box) => <div style={{ ...styles.outline, ...rectStyle(box()) }} />}</Show>
      <div style={styles.hint}>
        {label() ? `click to annotate ${label()}` : 'hover a component — Escape leaves'}
      </div>
    </>
  );
}

/** The marquee for a region note (same drag as the rich-screenshot tool). */
function RegionOverlay(props: { service: AnnotateService }): JSX.Element {
  const [start, setStart] = createSignal<{ x: number; y: number } | null>(null);
  const [now, setNow] = createSignal<{ x: number; y: number } | null>(null);
  const band = (): NoteRect | null => {
    const from = start();
    const to = now();
    if (!from || !to) return null;
    return {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(from.x - to.x),
      height: Math.abs(from.y - to.y)
    };
  };
  return (
    <>
      <div
        style={{ ...styles.shield, 'z-index': LAYER + 1 }}
        data-testid="wheel-annotate-region"
        onPointerDown={(event) => {
          setStart({ x: event.clientX, y: event.clientY });
          setNow({ x: event.clientX, y: event.clientY });
        }}
        onPointerMove={(event) => {
          if (start()) setNow({ x: event.clientX, y: event.clientY });
        }}
        onPointerUp={() => {
          const rect = band();
          setStart(null);
          setNow(null);
          if (rect && rect.width >= 4 && rect.height >= 4) props.service.pickRegion(rect);
          else props.service.discard();
        }}
      >
        <Show when={band()}>{(rect) => <div style={{ ...styles.band, ...rectStyle(rect()) }} />}</Show>
      </div>
      <div style={styles.hint}>drag a region to annotate it — Escape cancels</div>
    </>
  );
}

/** The composer: what you say about the thing you picked. */
function Composer(props: { service: AnnotateService }): JSX.Element {
  return (
    <Show when={props.service.draft.get()}>
      {(draft) => (
        <div style={styles.composer} data-testid="wheel-annotate-composer">
          <div style={styles.dim}>
            {draft().anchor.instanceId ?? (draft().anchor.kind === 'page' ? 'this page' : 'a region')}
            {draft().startedAt !== null ? ` · clip, ${draft().timeline.length} events` : ''}
          </div>
          <textarea
            style={styles.textarea}
            data-testid="wheel-annotate-text"
            placeholder="What is wrong here?"
            value={draft().text}
            onInput={(event) => props.service.setText(event.currentTarget.value)}
          />
          <div style={styles.row}>
            <For each={LABELS}>
              {(label) => (
                <button
                  type="button"
                  style={{
                    ...styles.button,
                    ...(draft().label === label
                      ? { 'border-color': 'var(--wheel-indigo-bright, #6366f1)' }
                      : {})
                  }}
                  onClick={() => props.service.setLabel(label)}
                >
                  {label}
                </button>
              )}
            </For>
          </div>
          <div style={styles.row}>
            <Show
              when={draft().listening}
              fallback={
                <button
                  type="button"
                  style={styles.button}
                  disabled={!speechRecognitionAvailable() && !navigator.mediaDevices}
                  onClick={() => props.service.listen()}
                >
                  🎤 talk
                </button>
              }
            >
              <button type="button" style={styles.button} onClick={() => props.service.stopListening()}>
                ■ stop talking
              </button>
            </Show>
            <Show when={props.service.recording.get()}>
              <span style={styles.dim}>recording…</span>
            </Show>
          </div>
          <Show when={draft().transcript}>
            <textarea
              style={styles.textarea}
              data-testid="wheel-annotate-transcript"
              value={draft().transcript}
              onInput={(event) => props.service.setTranscript(event.currentTarget.value)}
            />
          </Show>
          <Show when={draft().shot}>
            {(shot) => <img style={styles.preview} src={shot()} alt="annotated region" />}
          </Show>
          <Show when={draft().timeline.length > 0}>
            <div style={styles.dim}>
              <For each={draft().timeline.slice(-6)}>
                {(event) => <div>{`${event.kind} · ${describeEvent(event)}`}</div>}
              </For>
            </div>
          </Show>
          <div style={styles.row}>
            <button
              type="button"
              style={styles.button}
              data-testid="wheel-annotate-save"
              disabled={!props.service.hasContent()}
              title={
                props.service.canSave.get()
                  ? undefined
                  : 'No dev server here — the note downloads as one markdown file'
              }
              onClick={() => props.service.save()}
            >
              {props.service.canSave.get() ? 'save note' : 'download note'}
            </button>
            <button type="button" style={styles.button} onClick={() => props.service.discard()}>
              discard
            </button>
          </div>
          <Show when={props.service.notice.get()}>
            {(notice) => <div style={styles.dim}>{notice()}</div>}
          </Show>
          <Show when={props.service.lastCommand.get()}>
            {(command) => <div style={styles.dim}>copied: {command()}</div>}
          </Show>
        </div>
      )}
    </Show>
  );
}

/** Saved notes, as pins on the components they were left on. */
function Pins(props: { service: AnnotateService }): JSX.Element {
  return (
    <For each={props.service.notes.get()}>
      {(note: SavedNote, index) => {
        const pin = props.service.pinFor(note);
        return (
          <Show when={pin}>
            {(placed) => (
              <button
                type="button"
                data-testid="wheel-annotate-pin"
                title={`${note.payload.label}: ${note.payload.text || note.payload.voice?.transcript || note.id}${
                  placed().match === 'orphaned' ? ' (anchor lost)' : ''
                }`}
                style={{
                  ...styles.pin,
                  left: `${placed().rect.x + placed().rect.width - 9}px`,
                  top: `${placed().rect.y - 9}px`,
                  ...(placed().match === 'orphaned'
                    ? { background: 'var(--wheel-stage-ink-faint, #8b8b8b)' }
                    : {})
                }}
                onClick={() => props.service.copyCommand(note.id)}
              >
                {index() + 1}
              </button>
            )}
          </Show>
        );
      }}
    </For>
  );
}
