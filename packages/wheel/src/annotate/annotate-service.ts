/**
 * `AnnotateService` — the whole annotation flow as one state machine.
 *
 *   off ──arm──▶ armed ──draw a box──▶ composing ──save──▶ (sent) ──▶ armed
 *
 * There is ONE interaction: drag a rectangle around what you want to talk
 * about. Whatever was under it comes along — the components with their live
 * state, and the plain DOM for a page wheel does not own.
 *
 * Two things are worth knowing before reading the code:
 *
 * **The recorder runs before you press anything.** In dev the taps go in when
 * `WheelAnnotate` MOUNTS, keeping a rolling 60-second buffer for the whole
 * session. So every note carries the minute BEFORE the box was drawn — which
 * is the minute the bug happened in. Starting the buffer at arm time would be
 * useless: by then the thing you wanted has already happened.
 *
 * **Saving is a plain POST to a sink**, which the app configures and which
 * defaults to the dev server's handler. A sink that cannot be reached costs
 * nothing: the note downloads as one self-contained file instead.
 *
 * Everything that touches hardware (pixels, microphone, video) is injected —
 * the service itself is deterministic and testable with no browser at all.
 */
import { Service } from '../core/services';
import { logger } from '../core/logger';
import { serializeValue } from '../core/serialize';
import type { SyncClient } from '../sync/client/client';
import { activeErrorLog } from '../debug/error-capture';
import { causeMutations } from '../sync/client/provenance';

import { anchorToRegion, targetOf, targetsUnder } from './anchor';
import { rasterizeRegion } from './rasterize';
import { Recorder, stateTreeSnapshot } from './recorder';
import { annotateRecorder, startAnnotateSession } from './session';
import { downloadNote } from './download';
import { noteId, renderNoteFile, renderNoteMarkdown } from './note-format';
import { startVideo, startVoice, type VideoSession, type VoiceSession } from './media';
import type {
  AnnotateSink,
  NoteAnchor,
  NoteLabel,
  NotePayload,
  NoteRect,
  NoteTarget,
  RecordedEvent
} from './types';

/** Where notes go when the app does not say otherwise: the dev server's handler. */
const DEFAULT_SINK: AnnotateSink = { url: '/__wheel/note' };

/** How many components around the anchor a region note keeps. */
const NEARBY_LIMIT = 12;

/** How far back a clip reaches into the provenance log when harvesting writes. */
const PROVENANCE_HARVEST = 500;

/** Projection depth for a synced row's value in the timeline. */
const WRITE_DEPTH = 4;

/** How long the snackbar holds an outcome — long enough to read, short enough to ignore. */
const NOTICE_MS = 4_000;

/**
 * Where the flow currently is. `armed` is the marquee: drag a rectangle around
 * what you want to talk about. There is no other way in, and no mode to pick
 * first — drawing the rectangle IS the interaction.
 */
export type AnnotateMode = 'off' | 'armed' | 'composing';

/** A note being written: everything captured so far, none of it saved yet. */
export interface NoteDraft {
  /** The rectangle, and what was under it. */
  readonly anchor: NoteAnchor;
  /** The innermost component under the rectangle, with its captured state. */
  readonly target: NoteTarget | null;
  /** Every other component under the rectangle. */
  readonly nearby: readonly NoteTarget[];
  /** Typed note text. */
  readonly text: string;
  /** What kind of remark this is. */
  readonly label: NoteLabel;
  /** Live speech transcript, editable before save. */
  readonly transcript: string;
  /** Whether a voice session is capturing right now. */
  readonly listening: boolean;
  /** `data:image/png;base64,…` of the drawn rectangle. */
  readonly shot: string | null;
  /** `data:audio/webm;base64,…` from the microphone. */
  readonly audio: string | null;
  /** `data:video/webm;base64,…`, when screen recording was switched on. */
  readonly video: string | null;
  /** When the box was drawn — the start of what this note describes. */
  readonly openedAt: number;
  /** Every service's atoms when the box was drawn. */
  readonly startState: Record<string, Record<string, unknown>>;
}

/** Injected capture seams, so the service runs headless in tests. */
export interface AnnotateCapture {
  /** Grab a viewport rectangle as a PNG data URL. */
  region(rect: NoteRect): Promise<string>;
  /** The shared tab-capture stream, for clip video. */
  stream(): Promise<MediaStream>;
}

/**
 * The annotation flow (see the module doc). One per app; `WheelAnnotate`
 * mounts it and hands it the sync client and the capture seams.
 */
export class AnnotateService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'AnnotateService';

  /** State-tree group: debug tooling — hidden from the panel, visible to the bridge. */
  static override group = 'debug';

  /** Where the flow is: off, armed (picker live), region (marquee up), composing. */
  readonly mode = this.atom<AnnotateMode>('off', 'mode');
  /** The note being written, or null. */
  readonly draft = this.atom<NoteDraft | null>(null, 'draft');
  /** True while the screen is being recorded into the open draft. */
  readonly filming = this.atom(false, 'filming');
  /** True once the sink answered — which is what proves it can be saved to. */
  readonly canSave = this.atom(false, 'canSave');
  /** Absolute directory of the last save. */
  readonly savedTo = this.atom<string | null>(null, 'savedTo');
  /** The copy-and-paste command for the last save (`read .wheel/notes/…/note.md`). */
  readonly lastCommand = this.atom<string | null>(null, 'lastCommand');
  /**
   * The snackbar line: what just happened, or what the environment could not
   * give this note — no screen capture, no microphone, no video.
   *
   * Deliberately NOT an error. A headless browser, a denied permission and a
   * browser without speech recognition are all normal, and routing them
   * through `logger` would fill the error buffer that exists to make real
   * breakage unmissable. The note is still worth saving without pixels; the
   * snackbar just says what is missing.
   *
   * It renders OUTSIDE the composer, because the most important thing it ever
   * says — "saved" — is said at the moment the composer closes.
   */
  readonly notice = this.atom<string | null>(null, 'notice');

  /** Cancels the pending auto-dismiss, so a new message never inherits an old timer. */
  private readonly stopDismiss = this.field<(() => void) | null>(null, 'stopDismiss');

  /** Used only when nothing started a page-wide session (direct service use, tests). */
  private readonly ownRecorder = new Recorder({
    now: () => this.now(),
    registry: this.context.registry
  });

  /**
   * The rolling buffer, resolved on every read.
   *
   * It has to be lazy: `WheelAnnotate` starts the page-wide session, and this
   * service is constructed by the chrome that loads AFTERWARDS. Binding the
   * recorder at construction time picked the private fallback and quietly
   * recorded into a buffer no tap was feeding.
   */
  private get recorder(): Recorder {
    return annotateRecorder() ?? this.ownRecorder;
  }
  private readonly client = this.field<SyncClient | null>(null, 'client');
  private readonly sink = this.field<AnnotateSink>(DEFAULT_SINK, 'sink');
  private readonly capture = this.field<AnnotateCapture | null>(null, 'capture');
  private readonly voice = this.field<VoiceSession | null>(null, 'voice');
  private readonly video = this.field<VideoSession | null>(null, 'video');
  /** Error-buffer length when the current clip started, so a clip reports only ITS errors. */
  private readonly errorCursor = this.field(0, 'errorCursor');

  /** True when the draft has something worth saving. */
  readonly hasContent = this.computed(() => {
    const draft = this.draft.get();
    if (!draft) return false;
    return draft.text.trim().length > 0 || draft.transcript.trim().length > 0;
  }, 'hasContent');

  /**
   * Wire the sync client, the capture seams, and where notes are sent.
   * Called once by `WheelAnnotate`.
   */
  readonly attach = this.action(
    (client: SyncClient | null, capture: AnnotateCapture, sink?: AnnotateSink) => {
      this.client.set(client);
      this.capture.set(capture);
      if (sink) this.sink.set(sink);
      // Saving a note used to appear in the note. The recorder wraps `fetch`
      // for the whole page, so it has to be told which URL is ours.
      this.recorder.ignoreUrl(this.sink.get().url);
    },
    'attach'
  );

  /**
   * Start the rolling retro buffer. `WheelAnnotate` calls this on MOUNT, not
   * on arm — "save the last minute" is worthless if the minute only starts
   * once you have already noticed the bug. Whether it runs at all is the
   * mount's decision (`enabled`), so a public production page records
   * nothing unless the app says otherwise.
   */
  readonly beginSession = this.action(() => {
    startAnnotateSession({ now: () => this.now(), registry: this.context.registry });
  }, 'beginSession');

  /** Turn annotation mode on: the marquee goes live. */
  readonly arm = this.action(() => {
    if (this.mode.get() !== 'off') return;
    // Idempotent, and normally already done by the page-wide session that
    // started at mount. It matters when there is no session — a service used
    // directly, or a test.
    this.recorder.install();
    this.mode.set('armed');
    this.probeSink();
  }, 'arm');

  /**
   * Leave annotation mode: drops any draft and stops any recording.
   *
   * In dev the taps stay installed, because the retro buffer is a property of
   * the session rather than of the chrome. In production they come out.
   */
  readonly disarm = this.action(() => {
    this.cancelVoice();
    this.cancelVideo();
    this.draft.set(null);
    this.mode.set('off');
  }, 'disarm');

  /** Unmount: disarm. The session recorder keeps running; `stopAnnotateSession` ends it. */
  readonly endSession = this.action(() => {
    this.disarm();
  }, 'endSession');

  /**
   * The one door in: a drawn rectangle opens the composer.
   *
   * The rectangle is what a pointer reports — viewport coordinates — and it is
   * stored exactly that way. A note describes what was on screen at a moment,
   * so nothing here converts it into a place in the document.
   */
  readonly pickRegion = this.action((rect: NoteRect) => {
    const registry = this.context.registry;
    const nearby = targetsUnder(registry, rect, NEARBY_LIMIT);
    const innermost = nearby[0] ? registry.instance(nearby[0].instanceId) : undefined;
    this.draft.set({
      anchor: anchorToRegion(registry, rect),
      target: innermost ? targetOf(registry, innermost) : null,
      nearby,
      text: '',
      label: 'bug',
      transcript: '',
      listening: false,
      shot: null,
      audio: null,
      video: null,
      openedAt: this.now(),
      startState: stateTreeSnapshot(registry)
    });
    this.mode.set('composing');
    this.hold(null);
    // Pixels, automatically. This costs no permission prompt because it comes
    // from the DOM rather than the screen, which is the whole reason a note can
    // have a picture without anyone pressing anything.
    void rasterizeRegion(rect).then((shot) => {
      if (shot) this.patchDraft({ shot });
    });
  }, 'pickRegion');

  /** Typed note text. */
  readonly setText = this.action((text: string) => {
    this.patchDraft({ text });
  }, 'setText');

  /** The note's label. */
  readonly setLabel = this.action((label: NoteLabel) => {
    this.patchDraft({ label });
  }, 'setLabel');

  /** Hand-edit the transcript before saving — recognition gets technical words wrong. */
  readonly setTranscript = this.action((transcript: string) => {
    this.patchDraft({ transcript });
  }, 'setTranscript');

  /**
   * Start listening. The transcript streams into the draft as it is
   * recognized; the audio is kept beside it as the receipt.
   */
  readonly listen = this.action(() => {
    if (this.voice.get()) return;
    this.patchDraft({ listening: true });
    this.voice.set(startVoice({ onPartial: (text) => this.patchDraft({ transcript: text }) }));
  }, 'listen');

  /** Stop listening and keep what was heard. */
  readonly stopListening = this.action(() => {
    const session = this.voice.get();
    if (!session) return;
    this.voice.set(null);
    void session
      .stop()
      .then((result) => {
        this.patchDraft({
          listening: false,
          audio: result.audio,
          ...(result.transcript ? { transcript: result.transcript } : {})
        });
      })
      .catch(() => {
        this.say('no microphone — type the note instead');
        this.patchDraft({ listening: false });
      });
  }, 'stopListening');

  /**
   * Switch screen recording on or off for the open note.
   *
   * A switch rather than a mode: the timeline is recorded either way, and
   * video is the illustration you opt into. It is never automatic, because
   * starting it opens a browser permission prompt and a note is worth writing
   * without one.
   *
   * Switching it on and leaving it on is fine — `save()` stops the recording
   * and attaches it, so there is nothing to remember to press.
   */
  readonly toggleVideo = this.action(() => {
    if (this.video.get()) {
      this.stopVideo();
      return;
    }
    const capture = this.capture.get();
    if (!capture) return;
    this.hold('asking for screen capture…');
    void startVideo(() => capture.stream())
      .then((session) => {
        this.video.set(session);
        this.filming.set(true);
        this.hold(null);
      })
      .catch(() => this.say('no video — the note records everything else all the same'));
  }, 'toggleVideo');

  /** Throw the draft away and go back to armed. */
  readonly discard = this.action(() => {
    this.cancelVoice();
    this.cancelVideo();
    this.draft.set(null);
    this.mode.set('armed');
  }, 'discard');

  /**
   * Write the note.
   *
   * If the screen is being recorded, that has to finish first — the video is
   * part of what the note says. Everything after it is the same either way, so
   * the two paths meet again in `deliver`.
   */
  readonly save = this.action(() => {
    const draft = this.draft.get();
    if (!draft) return;
    const session = this.video.get();
    if (!session) {
      this.deliver(draft);
      return;
    }
    this.video.set(null);
    this.filming.set(false);
    this.hold('finishing the recording…');
    void session
      .stop()
      .then((video) => this.deliver({ ...draft, video }))
      .catch(() => this.deliver(draft));
  }, 'save');

  /**
   * Send one finished note, and fall back to a download if nothing answers.
   *
   * Deciding from `canSave` instead would race the probe — arm, draw, type
   * fast, hit save, and a note would go to a file even though a sink was right
   * there. So this always tries the sink, and catches.
   */
  private deliver(draft: NoteDraft): void {
    const payload = this.buildPayload(draft);
    const body = {
      id: payload.id,
      payload,
      markdown: renderNoteMarkdown(payload),
      png: draft.shot,
      video: draft.video,
      audio: draft.audio
    };
    this.draft.set(null);
    this.mode.set('armed');
    const sink = this.sink.get();
    void fetch(sink.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...sink.headers },
      body: JSON.stringify(body)
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`the note sink answered ${response.status}`);
        const result = (await response.json()) as {
          ok: boolean;
          dir?: string;
          command?: string;
          location?: string;
          error?: string;
        };
        if (!result.ok) throw new Error(result.error ?? 'the note sink refused the note');
        this.savedTo.set(result.dir ?? result.location ?? null);
        // A local sink hands back something to paste; a hosted one hands back
        // where the note now lives. Either is what the human wants next.
        const handle = result.command ?? result.location ?? null;
        this.lastCommand.set(handle);
        if (handle) void copyToClipboard(handle);
        this.say('note saved — read command copied');
      })
      .catch(() => this.deliverAsDownload(payload, draft.shot));
  }

  /**
   * Ask the sink whether it is there.
   *
   * Nothing on the page needs the note list; this is the capability probe, and
   * the only thing it decides is whether the button says "save" or "download".
   * Saving never waits for it.
   */
  private probeSink(): void {
    const sink = this.sink.get();
    void fetch(sink.url, { headers: sink.headers })
      .then((response) => this.canSave.set(response.ok))
      .catch(() => {
        // No sink reachable (a deployed page with none configured, a static
        // preview): saving falls back to a download, and the button says so.
        this.canSave.set(false);
      });
  }

  /** Take the snackbar away now, rather than waiting out its timer. */
  readonly dismissNotice = this.action(() => {
    this.hold(null);
  }, 'dismissNotice');

  /** The buffered timeline, for surfaces that show what is being recorded. */
  timeline(): readonly RecordedEvent[] {
    return this.recorder.timeline();
  }

  /**
   * Re-take the picture from the SCREEN rather than from the DOM.
   *
   * The automatic shot is a DOM rasterization, which cannot see a `<canvas>`,
   * a `<video>` or a cross-origin iframe. This is the escape hatch for those:
   * true pixels, at the cost of the browser's share prompt. Only ever called
   * because someone pressed the button.
   */
  readonly captureShot = this.action(() => {
    const draft = this.draft.get();
    const capture = this.capture.get();
    if (!draft || !capture) return;
    this.hold('capturing…');
    void capture
      .region(draft.anchor.rect)
      .then((shot) => {
        this.patchDraft({ shot });
        this.hold(null);
      })
      .catch(() => this.say('no screenshot — this browser or tab refused screen capture'));
  }, 'captureShot');

  /**
   * Say something in the snackbar, and take it away again.
   *
   * The dismissal goes through the context's scheduler seam rather than
   * `setTimeout`, so a test drives it on the controlled clock like everything
   * else and never waits four real seconds.
   */
  private say(text: string): void {
    this.hold(text);
    this.stopDismiss.set(
      this.defer(NOTICE_MS, () => {
        this.notice.set(null);
        this.stopDismiss.set(null);
      })
    );
  }

  /** Say something that stays until it is replaced or cleared — progress, not an outcome. */
  private hold(text: string | null): void {
    this.stopDismiss.get()?.();
    this.stopDismiss.set(null);
    this.notice.set(text);
  }

  /** Merge fields into the open draft; a no-op once the draft is gone. */
  private patchDraft(patch: Partial<NoteDraft>): void {
    const draft = this.draft.get();
    if (!draft) return;
    this.draft.set({ ...draft, ...patch });
  }

  private cancelVoice(): void {
    this.voice.get()?.cancel();
    this.voice.set(null);
  }

  /** Stop recording and keep the video for the open draft. */
  private stopVideo(): void {
    const session = this.video.get();
    if (!session) return;
    this.video.set(null);
    this.filming.set(false);
    void session
      .stop()
      .then((video) => this.patchDraft({ video }))
      .catch(() => this.say('no video — the note records everything else all the same'));
  }

  /** Drop a recording without keeping it — the draft it belonged to is going away. */
  private cancelVideo(): void {
    this.video.get()?.cancel();
    this.video.set(null);
    this.filming.set(false);
  }

  /**
   * The recorder's own events plus the two streams the app already records for
   * itself: sync writes (the provenance log) and errors (the capture buffer).
   */
  private harvest(from: number, to: number): RecordedEvent[] {
    const extra: RecordedEvent[] = [];
    const client = this.client.get();
    if (client) {
      for (const write of client.recentWrites(PROVENANCE_HARVEST)) {
        const cause = write.cause;
        // The sync layer owns what a cause contains; this only decides how to
        // print it. See `causeMutations`.
        const mutations = causeMutations(cause);
        extra.push({
          at: write.at,
          kind: 'write',
          collection: write.collection,
          rowId: write.rowId,
          // `optimistic:toggleCell`, or `optimistic:addRow+setTotal` when an
          // atomic group wrote several. The names are the whole point of the
          // line: `optimistic` alone says a local write happened, which the
          // reader already knew.
          cause: mutations.length > 0 ? `${cause.kind}:${mutations.join('+')}` : cause.kind,
          ...(write.value === undefined ? {} : { value: serializeValue(write.value, WRITE_DEPTH) })
        });
      }
    }
    const errors = activeErrorLog()?.entries() ?? [];
    for (const entry of errors.slice(this.errorCursor.get())) {
      extra.push({
        at: entry.at,
        kind: 'error',
        id: entry.id,
        message: entry.message,
        stack: entry.stack.length > 0 ? entry.stack.join('\n') : null
      });
    }
    return this.recorder.harvest(from, to, extra);
  }

  /** Assemble the payload that becomes `note.json` (and, projected, `note.md`). */
  private buildPayload(draft: NoteDraft): NotePayload {
    const at = this.now();
    const attachments = [
      ...(draft.shot ? ['shot.png'] : []),
      ...(draft.video ? ['clip.webm'] : []),
      ...(draft.audio ? ['audio.webm'] : [])
    ];
    // The window reaches back past the moment the box was drawn, because the
    // rolling buffer has been running since the annotator mounted. The thing
    // being complained about almost always happened BEFORE the complaint.
    //
    // But only if the app DID anything. On a page with no services — a docs
    // page, a landing scroll, a catalog of display fixtures — the buffer holds
    // nothing but raw input, and eighteen recorded keystrokes explain nothing
    // about anything. That is noise dressed as evidence, so it is dropped
    // along with the empty state tree that goes with it.
    //
    // "Anything" means an action, a state change, a sync write or an error.
    // Writes and errors count precisely because a note may have NO local
    // action behind it: an edit the server rejected and rolled back is a
    // write, a cause and an error, with the app's own atoms never moving —
    // and it is the single most useful thing a note can carry.
    const recorded = this.harvest(this.recorder.timeline()[0]?.at ?? draft.openedAt, at);
    const explains = recorded.some(
      (event) =>
        event.kind === 'action' ||
        event.kind === 'state' ||
        event.kind === 'write' ||
        event.kind === 'error'
    );
    const timeline = explains ? recorded : [];
    const startState = explains ? draft.startState : {};
    return {
      id: noteId(at, draft.text || draft.transcript, draft.anchor.name),
      at,
      text: draft.text,
      voice: draft.transcript
        ? { transcript: draft.transcript, hasAudio: draft.audio !== null, source: 'speech-recognition' }
        : null,
      label: draft.label,
      anchor: draft.anchor,
      target: draft.target,
      nearby: draft.nearby,
      environment: this.environment(),
      startedAt: timeline[0]?.at ?? draft.openedAt,
      endedAt: at,
      timeline,
      startState,
      attachments
    };
  }

  /** Page-level facts worth having when the note is read weeks later. */
  private environment(): NotePayload['environment'] {
    const client = this.client.get();
    return {
      // wheel-raw-location: a note RECORDS the address bar the human was
      // looking at. It never navigates, and it must work in apps that do not
      // use wheel's router.
      url: globalThis.location?.href ?? '',
      viewportWidth: globalThis.innerWidth ?? 0,
      viewportHeight: globalThis.innerHeight ?? 0,
      devicePixelRatio: globalThis.devicePixelRatio ?? 1,
      userAgent: globalThis.navigator?.userAgent ?? '',
      sync: client
        ? { connection: client.connectionStatus(), pendingMutations: client.pendingMutations() }
        : null
    };
  }

  /**
   * Hand the note to the human as one self-contained file.
   *
   * This is what production annotation ends in: no endpoint to POST to, and
   * no server quietly collecting other people's application state.
   */
  private deliverAsDownload(payload: NotePayload, shot: string | null): void {
    const filename = `${payload.id}.md`;
    downloadNote(filename, renderNoteFile(payload, shot));
    const command = `read ~/Downloads/${filename}`;
    this.savedTo.set(`${filename} (downloaded)`);
    this.lastCommand.set(command);
    this.say('no sink reachable — note downloaded, read command copied');
    void copyToClipboard(command);
  }
}

/** Write text to the clipboard, reporting rather than throwing when it is blocked. */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    logger.warn('wheel: could not copy the note command to the clipboard', error);
  }
}
