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
 *    notices a bug already exists when they finally press the chord;
 *  - renders the ✎ chip and binds ⌘⇧A / Ctrl+Shift+A.
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
import { Dynamic, Portal } from 'solid-js/web';

import { WheelContext } from '../core/context';
import { isWheelDevMode } from '../core/dev-mode';
import { CHROME_ATTRIBUTE } from './anchor';
import { logger } from '../core/logger';

import { startAnnotateSession, stopAnnotateSession } from './session';
import type { AnnotateSink } from './types';

/** Same layer the chrome uses, so the chip does not jump when the chrome loads. */
const LAYER = 10_400;

const chipStyle = {
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
} satisfies JSX.CSSProperties;

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
        logger.warn('wheel: annotation chrome failed to load', error);
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

  return (
    <Show when={enabled()}>
      {/* The chrome brings its own chip (with the recording indicator), so
          this one only stands in until the chunk arrives. */}
      <Show when={!chrome()}>
        <Portal>
          <button
            type="button"
            style={chipStyle}
            // Marked like the rest of the chrome: pressing the chip is not
            // something the app did, and a note that records its own opening
            // buries what it was about.
            {...{ [CHROME_ATTRIBUTE]: '' }}
            data-testid="wheel-annotate-chip"
            title="Annotate this page (⌘⇧A)"
            onClick={open}
          >
            <span>✎</span>
          </button>
        </Portal>
      </Show>
      <Show when={chrome()}>
        {(loaded) => <Dynamic component={loaded()} sink={props.sink} />}
      </Show>
    </Show>
  );
}
