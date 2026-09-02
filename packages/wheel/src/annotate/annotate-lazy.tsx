/**
 * `<WheelAnnotate/>` — the resident half: a rolling recorder and a chip.
 *
 *   <WheelApp client={client}>
 *     <YourApp />
 *     <WheelAnnotate enabled={user.isStaff} />
 *   </WheelApp>
 *
 * Mounting this does two cheap things and defers everything else:
 *
 *  - starts the 60-second rolling buffer, so the minute BEFORE someone
 *    notices a bug already exists when they finally arm;
 *  - contributes the ANNOTATE PANE to the debug dock, and binds
 *    ⌘⇧A / Ctrl+Shift+A.
 *
 * There is no floating chip. Annotating is something you do to a wheel app, so
 * the way in is the app's own instrument panel — beside the state tree, the
 * component tree and the errors — rather than a button hovering over the
 * product. A page with no dock has no way in, which is correct: there is
 * nothing there worth annotating.
 *
 * The picker, the composer, voice capture and note rendering are behind a
 * dynamic `import()` and arrive the first time someone arms. Measured on the
 * tracker: this module plus the recorder costs 4.1 KB gzipped in the main
 * bundle, and keeps 8.7 KB out of it.
 *
 * ## Who can arm it
 *
 * `enabled` defaults to dev mode, so a production build records nothing and
 * shows nothing unless the app says otherwise. Production annotation is a
 * decision about whose application state gets captured, so it belongs to the
 * app, not to the framework:
 *
 *   <WheelAnnotate enabled={session.actor?.isStaff === true} />
 *   <WheelAnnotate enabled={localStorage.getItem('wheel.annotate') === '1'} />
 *
 * The second form is the one to reach for when something is wrong on a live
 * deployment: set the key in the console, reload, and the buffer is running.
 */
// wheel-component-root: annotation chrome — must never appear in its own picks
// wheel-view-root: annotation chrome — must not appear in the tree it annotates
// wheel-untracked-show: annotation chrome — excluded from the component tree
// wheel-raw-signal: this chrome registers no instance, so a named signal would
// be recorded against whatever app component happens to be its nearest
// registered ancestor
import { Show, createEffect, createSignal, onCleanup, useContext, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';

import { WheelContext } from '../core/context';
import { isWheelDevMode } from '../core/dev-mode';
import { registerDebugPane } from '../debug/panes';
import { logger } from '../core/logger';

import { startAnnotateSession, stopAnnotateSession } from './session';
import type { AnnotateSink } from './types';

/** The pane's own controls, matching the dock's other buttons. */
const paneStyles = {
  title: {
    margin: '0 0 4px',
    color: 'var(--wheel-stage-ink-faint, #8b8b8b)',
    'text-transform': 'uppercase',
    'letter-spacing': '0.5px',
    'font-size': '9.5px'
  },
  button: {
    display: 'block',
    width: '100%',
    padding: '4px 8px',
    'border-radius': '6px',
    border: '1px solid var(--wheel-stage-line-heavy, #3a3b3e)',
    background: 'var(--wheel-stage-2, #101317)',
    color: 'var(--wheel-stage-ink, #d7d3cc)',
    font: '12px ui-monospace, monospace',
    cursor: 'pointer',
    'text-align': 'left'
  },
  hint: { padding: '6px 0', color: 'var(--wheel-stage-ink-faint, #8b8b8b)' }
} satisfies Record<string, JSX.CSSProperties>;

/** Props for {@link WheelAnnotate}. */
export interface WheelAnnotateProps {
  /**
   * Where notes are sent and read back from. Defaults to the dev server's
   * `/__wheel/note`, which writes a directory per note.
   *
   * Point it at anything that speaks the two-method contract in
   * {@link AnnotateSink} — a Durable Object, an issue tracker, a bucket — and
   * nothing else about the annotator changes. A sink that cannot be reached
   * makes saving fall back to downloading the note as one file, so a
   * misconfigured URL loses nothing.
   */
  readonly sink?: AnnotateSink;
  /**
   * Whether annotation is available on this page. Defaults to dev mode.
   *
   * In production this is the app's call, because it decides whose state may
   * be captured — usually a staff flag or a local opt-in.
   */
  readonly enabled?: boolean;
}

/** Mount the annotator: a rolling recorder now, the chrome on demand. */
export function WheelAnnotate(props: WheelAnnotateProps): JSX.Element {
  const context = useContext(WheelContext);
  if (!context) return null;
  const enabled = (): boolean => props.enabled ?? isWheelDevMode();

  const [chrome, setChrome] = createSignal<((props: { sink?: AnnotateSink }) => JSX.Element) | null>(
    null
  );
  let loading = false;

  /** Pull in the chrome. It arms itself on mount, so this IS "arm". */
  const open = (): void => {
    if (chrome() || loading) return;
    loading = true;
    void import('./annotate-system')
      .then((module) => setChrome(() => module.AnnotateChrome))
      .catch((error: unknown) => {
        loading = false;
        // Nearly always a stale page: the chunk name carries a content hash,
        // so a rebuild while the tab sat open leaves it asking for a file that
        // no longer exists. Worth saying, because "failed to fetch" reads like
        // a network fault and the fix is a reload.
        logger.warn(
          'wheel: annotation chrome failed to load — if the app was rebuilt while this page was open, reload it',
          error
        );
      });
  };

  // Imperative boundary: the rolling buffer is a property of the PAGE, not of
  // the chrome, so it starts here and outlives every arm/disarm cycle.
  createEffect(() => {
    if (!enabled()) return;
    startAnnotateSession({ now: () => context.services.now(), registry: context.services.registry });
    onCleanup(() => stopAnnotateSession());
  });

  // listener boundary: the arming chord is a global shortcut, so it binds to
  // the document rather than to any element the annotator renders.
  createEffect(() => {
    if (!enabled()) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'a' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        open();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  // The dock cannot import the annotator (the DAG runs annotate → debug), so
  // the pane comes to it. It leaves with this component.
  createEffect(() => {
    if (!enabled()) return;
    onCleanup(
      registerDebugPane({
        id: 'annotate',
        label: 'annotate',
        icon: '✎',
        weight: 3,
        render: () => <AnnotatePane armed={() => chrome() !== null} arm={open} />
      })
    );
  });

  return (
    <Show when={enabled() && chrome()}>
      {(loaded) => <Dynamic component={loaded()} sink={props.sink} />}
    </Show>
  );
}

/**
 * The annotate pane: one button until the chrome is loaded, then a reminder of
 * how to use it.
 *
 * Deliberately thin. Once armed, everything worth looking at is ON the page —
 * the marquee, the composer, the outline — so a pane that mirrored it would
 * just be a second place to look.
 */
function AnnotatePane(props: { armed: () => boolean; arm: () => void }): JSX.Element {
  return (
    <>
      <div style={paneStyles.title}>annotate</div>
      <Show
        when={props.armed()}
        fallback={
          <button
            type="button"
            style={paneStyles.button}
            data-testid="wheel-annotate-arm"
            title="Draw a rectangle around what is wrong (⌘⇧A)"
            onClick={props.arm}
          >
            ✎ annotate this app
          </button>
        }
      >
        <div style={paneStyles.hint} data-testid="wheel-annotate-armed">
          drag a rectangle over the app — Escape leaves
        </div>
      </Show>
    </>
  );
}
