/**
 * `<AnnotateChrome/>` — everything you SEE when annotation mode is armed.
 *
 * This module is the lazy half. `WheelAnnotate` (annotate-lazy.tsx) imports it
 * dynamically the first time someone arms, so a production bundle carries the
 * recorder and a chip rather than the marquee, the composer and voice capture.
 *
 * There is ONE interaction: drag a rectangle. Armed, the shield covers the page
 * so a press reaches the marquee and never the UI beneath it, and releasing
 * opens the composer holding everything that was under the box — the components
 * with their live state, the plain DOM, and the minute of app activity the
 * rolling recorder already had.
 *
 * Every surface it draws carries `CHROME_ATTRIBUTE`, which is how the rest of
 * the feature knows to look past the annotator: the anchor's hit-test skips it
 * (or it would describe the shield), the recorder ignores input inside it (or a
 * timeline would be mostly the keystrokes that wrote the note), and the
 * screenshot filters it out (or every picture would have the composer in it).
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

import { registerDebugPane } from '../debug/panes';

import { AnnotateService, type SavedNote } from './annotate-service';
import { CHROME_ATTRIBUTE } from './anchor';
import { describeEvent } from './note-format';
import { speechRecognitionAvailable } from './media';
import type { AnnotateSink, NoteLabel, NoteRect } from './types';
import { COMPOSER_KEYS, armChord, typingInto } from './shortcuts';

/** Above the app, below the debug panel's own chrome. */
const LAYER = 10_400;

/** Below this many pixels in either direction, a drag was really a click. */
const DRAG_THRESHOLD = 5;

/** The labels a note can carry, in the order they appear in the composer. */
const LABELS: readonly NoteLabel[] = ['bug', 'question', 'idea', 'todo', 'looks-good'];

const styles = {
  filming: {
    position: 'fixed',
    left: '12px',
    bottom: '12px',
    'z-index': LAYER + 2,
    padding: '4px 10px',
    'border-radius': '999px',
    border: '1px solid var(--wheel-danger-deep, #b91c1c)',
    background: 'var(--wheel-stage-2, #101317)',
    color: 'var(--wheel-danger-soft, #fca5a5)',
    font: '12px ui-monospace, monospace',
    'pointer-events': 'none'
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
  preview: {
    'max-width': '100%',
    'border-radius': '4px',
    border: '1px solid var(--wheel-stage-line-strong, #2a2f3a)'
  },
  snackbar: {
    position: 'fixed',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    // Above the composer: the thing it most often says is "saved", and the
    // composer is on its way out at that moment.
    'z-index': LAYER + 4,
    'max-width': '80vw',
    padding: '8px 14px',
    'border-radius': '8px',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    background: 'var(--wheel-stage-4, #1a1d23)',
    color: 'var(--wheel-stage-ink-strong, #e5e7eb)',
    font: '12px ui-monospace, monospace',
    // wheel-color: a floating surface needs a shadow to separate from the app
    'box-shadow': '0 6px 20px rgba(0,0,0,0.35)',
    cursor: 'pointer'
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
export function AnnotateChrome(props: { readonly sink?: AnnotateSink }): JSX.Element {
  const context = useContext(WheelContext);
  if (!context) return null;
  const service = context.services.get(AnnotateService);
  service.attach(
    context.client as SyncClient | null,
    {
      region: (rect) =>
        captureViewportRegion({ left: rect.x, top: rect.y, width: rect.width, height: rect.height }),
      stream: () => tabCaptureStream()
    },
    props.sink
  );

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

  /*
   * The composer's keys — talk, save, discard — bound only WHILE composing.
   *
   * Single letters, so they are ignored whenever a text box has focus:
   * otherwise typing "the save button is broken" would save, discard and talk
   * on the way through. Click out of the note box (or never click in, having
   * spoken it) and they work.
   *
   * The effect re-runs on every mode change, and its cleanup removes the last
   * listener, so nothing stays bound once the composer closes.
   */
  // listener boundary: these are mode-wide shortcuts, not events of any one
  // element the annotator renders.
  createEffect(() => {
    if (service.mode.get() !== 'composing') return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typingInto(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === COMPOSER_KEYS.talk) {
        event.preventDefault();
        if (service.draft.get()?.listening) service.stopListening();
        else service.listen();
      } else if (key === COMPOSER_KEYS.save) {
        event.preventDefault();
        if (service.hasContent()) service.save();
      } else if (key === COMPOSER_KEYS.discard) {
        event.preventDefault();
        service.discard();
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

  // Replaces the stub's pane (same id): the composer, and the notes this
  // session wrote, belong in the dock beside the app's other instruments —
  // not in a panel floating over the thing being annotated.
  onCleanup(
    registerDebugPane({
      id: 'annotate',
      label: 'annotate',
      icon: '✎',
      weight: 3,
      render: () => <AnnotatePane service={service} />
    })
  );

  return (
    <Portal>
      {/* Recording is the one thing that must be visible while you use the
          app, because the app is what you are recording — the dock may be
          closed, and forgetting is expensive. */}
      <Show when={service.filming.get()}>
        <div style={styles.filming} {...{ [CHROME_ATTRIBUTE]: '' }} data-testid="wheel-annotate-filming">
          ● rec
        </div>
      </Show>
      <Show when={service.mode.get() === 'armed'}>
        <Marquee service={service} />
      </Show>
      <Show when={service.mode.get() === 'composing'}>
        <TargetOutline service={service} />
      </Show>
      <Snackbar service={service} />
    </Portal>
  );
}

/**
 * The marquee: drag a rectangle around what you want to talk about.
 *
 * This is the whole interaction — there is no mode to pick and nothing to
 * click. The shield sits over the page so a press reaches the marquee and
 * never the UI beneath it: dragging across a sheet cell selects the area
 * rather than starting an edit.
 *
 * A press that never really moved is ignored on purpose. It used to take
 * whatever single component was under the cursor, which meant a stray click
 * opened a composer nobody asked for.
 */
function Marquee(props: { service: AnnotateService }): JSX.Element {
  const [start, setStart] = createSignal<{ x: number; y: number } | null>(null);
  const [now, setNow] = createSignal<{ x: number; y: number } | null>(null);

  /** The band being dragged, in viewport coordinates. */
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

  const finish = (): void => {
    const rect = band();
    setStart(null);
    setNow(null);
    if (!rect || rect.width < DRAG_THRESHOLD || rect.height < DRAG_THRESHOLD) return;
    props.service.pickRegion(rect);
  };

  return (
    <>
      <div
        style={styles.shield}
        data-testid="wheel-annotate-shield"
        {...{ [CHROME_ATTRIBUTE]: '' }}
        onPointerDown={(event) => {
          setStart({ x: event.clientX, y: event.clientY });
          setNow({ x: event.clientX, y: event.clientY });
        }}
        onPointerMove={(event) => {
          if (start()) setNow({ x: event.clientX, y: event.clientY });
        }}
        onPointerUp={finish}
      >
        <Show when={band()}>{(rect) => <div style={{ ...styles.band, ...rectStyle(rect()) }} />}</Show>
      </div>
      <div style={styles.hint} {...{ [CHROME_ATTRIBUTE]: '' }}>
        {start() ? 'release to annotate this area' : 'drag an area to annotate it — Escape leaves'}
      </div>
    </>
  );
}

/** The area the open draft is about, outlined while you write. */
function TargetOutline(props: { service: AnnotateService }): JSX.Element {
  return (
    <Show when={props.service.draft.get()?.anchor.rect}>
      {(rect) => (
        <div
          data-testid="wheel-annotate-target"
          {...{ [CHROME_ATTRIBUTE]: '' }}
          style={{ ...styles.outline, ...rectStyle(rect()) }}
        />
      )}
    </Show>
  );
}

/**
 * The annotate pane: the whole flow, in the dock.
 *
 * Arming, writing and the notes already written all live here rather than in a
 * panel floating over the app. The app keeps only what has to be ON it — the
 * marquee, the outline of the area, the recording light.
 *
 * The state it shows is the SERVICE's, which is what fixes a bug the stub pane
 * had: it tracked "is the chrome loaded", and the chrome never unloads, so
 * after saving a note the pane still read "drag a rectangle over the app".
 */
function AnnotatePane(props: { service: AnnotateService }): JSX.Element {
  const mode = (): string => props.service.mode.get();
  return (
    <>
      <div style={paneStyles.title}>annotate</div>
      <Show when={mode() === 'composing'} fallback={<AnnotateArm service={props.service} />}>
        <Composer service={props.service} />
      </Show>
      <SavedNotes service={props.service} />
    </>
  );
}

/** Off: an invitation. Armed: what to do next, and a way out. */
function AnnotateArm(props: { service: AnnotateService }): JSX.Element {
  const armed = (): boolean => props.service.mode.get() === 'armed';
  return (
    <Show
      when={armed()}
      fallback={
        <button
          type="button"
          style={paneStyles.button}
          data-testid="wheel-annotate-arm"
          title="Draw a rectangle around what is wrong"
          onClick={() => props.service.arm()}
        >
          ✎ annotate this app <Key of={armChord()} />
        </button>
      }
    >
      <div style={paneStyles.hint} data-testid="wheel-annotate-armed">
        drag a rectangle over the app
      </div>
      <button
        type="button"
        style={paneStyles.button}
        data-testid="wheel-annotate-disarm"
        onClick={() => props.service.disarm()}
      >
        ✕ stop annotating <Key of="Esc" />
      </button>
    </Show>
  );
}

/**
 * What this session has written.
 *
 * A saved note used to vanish: the only evidence was a clipboard you had to
 * trust. Each row here is a note that EXISTS — press it to rewrite what it
 * says, or ⧉ to put its handle back on the clipboard.
 *
 * Rewriting is the row's main press because the first draft of a bug report is
 * usually written in a hurry, and the second one is the useful one. Saving it
 * lands on the same note rather than beside it.
 */
function SavedNotes(props: { service: AnnotateService }): JSX.Element {
  const notes = (): readonly SavedNote[] => props.service.saved.get();
  return (
    <Show when={notes().length > 0}>
      <div style={paneStyles.title}>saved this session ({notes().length})</div>
      <For each={[...notes()].reverse()}>
        {(note) => (
          <div style={paneStyles.noteRow} data-testid="wheel-annotate-saved">
            <button
              type="button"
              style={paneStyles.note}
              data-testid="wheel-annotate-edit"
              title="Rewrite this note"
              onClick={() => props.service.editNote(note)}
            >
              <span style={paneStyles.noteLabel}>{note.label}</span>
              <span style={paneStyles.noteText}>{note.text}</span>
              <Show when={note.delivery === 'download'}>
                <span style={paneStyles.noteWhere}>downloaded</span>
              </Show>
            </button>
            <Show when={note.command}>
              <button
                type="button"
                style={paneStyles.noteCopy}
                data-testid="wheel-annotate-copy"
                title={note.command ?? undefined}
                onClick={() => props.service.copyHandle(note)}
              >
                ⧉
              </button>
            </Show>
          </div>
        )}
      </For>
    </Show>
  );
}

/** The pane's own controls, matching the dock's other buttons. */
const paneStyles = {
  title: {
    margin: '4px 0',
    color: 'var(--wheel-stage-ink-faint, #8b8b8b)',
    'text-transform': 'uppercase',
    'letter-spacing': '0.5px',
    'font-size': '9.5px'
  },
  button: {
    display: 'block',
    width: '100%',
    padding: '4px 8px',
    'margin-bottom': '4px',
    'border-radius': '6px',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    background: 'var(--wheel-stage-2, #101317)',
    color: 'var(--wheel-stage-ink, #d7d3cc)',
    font: '12px ui-monospace, monospace',
    cursor: 'pointer',
    'text-align': 'left'
  },
  hint: { padding: '2px 0 6px', color: 'var(--wheel-stage-ink-faint, #8b8b8b)' },
  key: {
    padding: '0 4px',
    'border-radius': '3px',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    background: 'var(--wheel-stage-3, #16191f)',
    color: 'var(--wheel-stage-ink-faint, #8b8b8b)',
    font: 'inherit',
    'font-size': '10px'
  },
  note: {
    display: 'flex',
    gap: '6px',
    width: '100%',
    padding: '2px 0',
    border: 'none',
    background: 'none',
    color: 'var(--wheel-stage-ink, #d7d3cc)',
    font: 'inherit',
    cursor: 'pointer',
    'text-align': 'left',
    'align-items': 'baseline'
  },
  noteLabel: { color: 'var(--wheel-indigo-edge, #93c5fd)', 'flex-shrink': 0 },
  noteText: {
    overflow: 'hidden',
    'text-overflow': 'ellipsis',
    'white-space': 'nowrap',
    'min-width': 0
  },
  noteWhere: { color: 'var(--wheel-stage-ink-faint, #8b8b8b)', 'flex-shrink': 0 },
  noteRow: { display: 'flex', 'align-items': 'baseline', gap: '4px' },
  noteCopy: {
    padding: '2px 4px',
    border: 'none',
    background: 'none',
    color: 'var(--wheel-stage-ink-faint, #8b8b8b)',
    font: 'inherit',
    cursor: 'pointer',
    'flex-shrink': 0
  }
} satisfies Record<string, JSX.CSSProperties>;

/**
 * A key printed on the control it drives.
 *
 * The label and the handler read the same constant, so a shortcut cannot be
 * renamed in one place and left stale in the other.
 */
function Key(props: { of: string }): JSX.Element {
  return (
    <kbd style={paneStyles.key} data-testid="wheel-annotate-key">
      {props.of}
    </kbd>
  );
}

/** The composer: what you say about the thing you picked. */
function Composer(props: { service: AnnotateService }): JSX.Element {
  return (
    <Show when={props.service.draft.get()}>
      {(draft) => (
        <div style={styles.composer} data-testid="wheel-annotate-composer" {...{ [CHROME_ATTRIBUTE]: '' }}>
          <div style={styles.dim} data-testid="wheel-annotate-subject">
            {draft().anchor.instanceId ?? draft().anchor.element ?? 'this area'}
          </div>
          <Show when={draft().basedOn}>
            <div style={styles.dim} data-testid="wheel-annotate-rewriting">
              rewriting a saved note — what was captured stays
            </div>
          </Show>
          <textarea
            style={styles.textarea}
            data-testid="wheel-annotate-text"
            placeholder="add annotation"
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
                  data-testid="wheel-annotate-talk"
                  disabled={!speechRecognitionAvailable() && !navigator.mediaDevices}
                  onClick={() => props.service.listen()}
                >
                  🎤 talk <Key of={COMPOSER_KEYS.talk} />
                </button>
              }
            >
              <button
                type="button"
                style={styles.button}
                data-testid="wheel-annotate-talk"
                onClick={() => props.service.stopListening()}
              >
                ■ stop talking <Key of={COMPOSER_KEYS.talk} />
              </button>
            </Show>
          </div>
          {/* Capture belongs to the moment the box was drawn. A rewrite is
              hours later and looking at a different screen, so it changes the
              words and nothing else — see `buildPayload`. */}
          <Show when={!draft().basedOn}>
          <div style={styles.row}>
            {/* The picture is already taken — this re-takes it from the SCREEN
                for the cases a DOM rasterization cannot see: canvas, video, a
                cross-origin iframe. That one costs a share prompt, so it stays
                a button. */}
            <button
              type="button"
              style={styles.button}
              data-testid="wheel-annotate-shot"
              title="Re-take from the screen — opens a share prompt. Use it when the automatic picture is wrong."
              onClick={() => props.service.captureShot()}
            >
              {draft().shot ? '📷 re-take from screen' : '📷 screenshot'}
            </button>
            {/* A switch, not a mode: the note records what the app did either
                way, and this adds the pictures. Leaving it on is fine — saving
                stops the recording and attaches it. */}
            <button
              type="button"
              style={{
                ...styles.button,
                ...(props.service.filming.get()
                  ? { 'border-color': 'var(--wheel-indigo-bright, #6366f1)' }
                  : {})
              }}
              data-testid="wheel-annotate-film"
              title="Records the screen until you save"
              onClick={() => props.service.toggleVideo()}
            >
              {props.service.filming.get() ? '⏹ recording — click to stop' : '🎥 record screen'}
            </button>
            <Show when={draft().video}>
              <span style={styles.dim}>🎥 attached</span>
            </Show>
          </div>
          <Show when={draft().shot}>
            {(shot) => <img style={styles.preview} src={shot()} alt="annotated region" />}
          </Show>
          {/* What the note will carry: the rolling buffer, live. Nothing was
              pressed to record this — it has been running since the annotator
              mounted, which is why the minute before the box was drawn is in
              it too. */}
          <Show when={props.service.timeline().length > 0}>
            <div style={styles.dim} data-testid="wheel-annotate-timeline">
              <div>{`${props.service.timeline().length} events recorded`}</div>
              <For each={props.service.timeline().slice(-4)}>
                {(event) => <div>{`${event.kind} · ${describeEvent(event)}`}</div>}
              </For>
            </div>
          </Show>
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
              {draft().basedOn
                ? 'update note'
                : props.service.canSave.get()
                  ? 'save note'
                  : 'download note'}{' '}
              <Key of={COMPOSER_KEYS.save} />
            </button>
            <button
              type="button"
              style={styles.button}
              data-testid="wheel-annotate-discard"
              onClick={() => props.service.discard()}
            >
              discard <Key of={COMPOSER_KEYS.discard} />
            </button>
          </div>
          <Show when={props.service.lastCommand.get()}>
            {(command) => <div style={styles.dim}>copied: {command()}</div>}
          </Show>
        </div>
      )}
    </Show>
  );
}

/**
 * The snackbar: what just happened.
 *
 * Outside every mode branch on purpose. Saving closes the composer and returns
 * to armed, so a confirmation rendered inside the composer was drawn and
 * destroyed in the same tick — the note went to disk and the page said nothing.
 *
 * The service takes the message away on its own timer; clicking dismisses it
 * early, because a message about the thing you just did should never be in the
 * way of the next thing.
 */
function Snackbar(props: { service: AnnotateService }): JSX.Element {
  return (
    <Show when={props.service.notice.get()}>
      {(notice) => (
        <div
          style={styles.snackbar}
          {...{ [CHROME_ATTRIBUTE]: '' }}
          data-testid="wheel-annotate-toast"
          role="status"
          onClick={() => props.service.dismissNotice()}
        >
          {notice()}
        </div>
      )}
    </Show>
  );
}
