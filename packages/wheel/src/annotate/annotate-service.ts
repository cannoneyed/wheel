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
  /**
   * The note being rewritten, when this draft reopened one.
   *
   * Its captured half is carried through untouched; only the words change.
   */
  readonly basedOn: NotePayload | null;
}

/** One note this session wrote, and how to get back to it. */
export interface SavedNote {
  /** `<epoch>-<slug>`, the note's own id. */
  readonly id: string;
  /** The prose it was saved with, for a list a human can scan. */
  readonly text: string;
  /** What the label said. */
  readonly label: NoteLabel;
  /** Something pasteable — a read command, or a URL — when there was one. */
  readonly command: string | null;
  /** Whether it reached a sink, or fell back to a download. */
  readonly delivery: 'sink' | 'download';
  /**
   * The note as it was written.
   *
   * Kept whole so the note can be REOPENED. Editing a note edits what you
   * said about the app, never what was captured of it: the anchor, the
   * timeline, the state and the screenshot are evidence, and re-deriving them
   * an hour later would describe a different moment under the same words.
   */
  readonly payload: NotePayload;
}

/**
 * The injected capture seam, so the service runs headless in tests.
 *
 * One method, because there is one thing the annotator needs from the browser
 * that it cannot do itself: the display stream. Stills come from the DOM
 * rasterizer, which needs no permission and no seam of its own here.
 */
export interface AnnotateCapture {
  /** The shared tab-capture stream, which a clip crops its rectangle out of. */
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

  /**
   * Whether a recording is running: the taps are in, and a clip is open.
   *
   * Distinct from {@link filming}, which is only about the screen video. The
   * screen prompt can be refused while the app's actions and state are still
   * being recorded, and that case has to be visible.
   */
  readonly recording = this.atom(false, 'recording');
  /** True once the sink answered — which is what proves it can be saved to. */
  readonly canSave = this.atom(false, 'canSave');
  /** Absolute directory of the last save. */
  readonly savedTo = this.atom<string | null>(null, 'savedTo');
  /**
   * Notes written in this session, newest last.
   *
   * Kept here rather than read back from the sink, because a note that
   * DOWNLOADED never went to a sink at all and still happened. The panel lists
   * these so saving leaves a trace you can point at — before this, a saved
   * note vanished and the only evidence was a clipboard you had to trust.
   */
  readonly saved = this.atom<readonly SavedNote[]>([], 'saved');
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

  /**
   * The event recorder, installed only while a recording runs.
   *
   * It used to be a page-wide rolling buffer, always on, so a note could carry
   * the minute BEFORE the box was drawn. That was the wrong trade in practice:
   * an always-on tap records everything a session does whether or not anyone
   * ever writes a note, and what it mostly captured was the act of using the
   * tools. Recording is now something you ask for — see {@link toggleRecording}.
   */
  private readonly recorder = new Recorder({
    now: () => this.now(),
    registry: this.context.registry
  });
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

  /** Turn annotation mode on: the marquee goes live. Nothing is recorded yet. */
  readonly arm = this.action(() => {
    if (this.mode.get() !== 'off') return;
    this.mode.set('armed');
    this.probeSink();
  }, 'arm');

  /** Leave annotation mode: drops any draft, and stops any recording with it. */
  readonly disarm = this.action(() => {
    this.cancelVoice();
    this.cancelRecording();
    this.draft.set(null);
    this.mode.set('off');
  }, 'disarm');

  /** Unmount: disarm, which takes the taps out with it. */
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
      startState: stateTreeSnapshot(registry),
      basedOn: null
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

  /**
   * Move or resize the open rectangle.
   *
   * The rectangle IS the question, so changing it changes what the note is
   * about: the anchor, the components underneath and the picture are all
   * re-taken. What you have already written is kept — you are correcting the
   * aim, not starting again.
   *
   * Called on release rather than per frame. Hit-testing the whole tree and
   * rasterizing the DOM both cost real time, and the app being annotated is
   * the app they would cost it on.
   */
  readonly reshapeRegion = this.action((rect: NoteRect) => {
    const draft = this.draft.get();
    if (!draft) return;
    const registry = this.context.registry;
    const nearby = targetsUnder(registry, rect, NEARBY_LIMIT);
    const innermost = nearby[0] ? registry.instance(nearby[0].instanceId) : undefined;
    this.draft.set({
      ...draft,
      anchor: anchorToRegion(registry, rect),
      target: innermost ? targetOf(registry, innermost) : null,
      nearby
    });
    void rasterizeRegion(rect).then((shot) => {
      if (shot) this.patchDraft({ shot });
    });
  }, 'reshapeRegion');

  /**
   * Show the rectangle where the pointer has dragged it to, and nothing more.
   *
   * Separate from {@link reshapeRegion} because a drag writes this on every
   * frame: it moves the outline and leaves the expensive half — what is under
   * it, and the picture of it — for the release.
   */
  readonly previewRegion = this.action((rect: NoteRect) => {
    const draft = this.draft.get();
    if (!draft) return;
    this.draft.set({ ...draft, anchor: { ...draft.anchor, rect } });
  }, 'previewRegion');

  /** Typed note text. */
  readonly setText = this.action((text: string) => {
    this.patchDraft({ text });
  }, 'setText');

  /** The note's label. */
  readonly setLabel = this.action((label: NoteLabel) => {
    this.patchDraft({ label });
  }, 'setLabel');

  /**
   * What was already typed when listening started.
   *
   * Recognition sends a GROWING partial, not a stream of new words, so each
   * partial replaces the last. Speaking after typing therefore has to write
   * `base + partial` rather than append, or every partial would repeat what
   * came before it.
   */
  private readonly voiceBase = this.field('', 'voiceBase');

  /**
   * Start listening. The words land in the note box as they are recognized;
   * the audio is kept beside them as the receipt.
   *
   * There is no second box for the transcript. Dictation is a way of writing
   * the note, not a separate thing attached to it — a transcript sitting in
   * its own field is one more thing to read and reconcile. The draft still
   * keeps what recognition HEARD, so the saved note can say it was spoken and
   * carry the raw words even after the text is edited by hand.
   */
  readonly listen = this.action(() => {
    if (this.voice.get()) return;
    const typed = this.draft.get()?.text ?? '';
    this.voiceBase.set(typed && !typed.endsWith(' ') ? `${typed} ` : typed);
    this.patchDraft({ listening: true });
    this.voice.set(
      startVoice({
        onPartial: (heard) => this.patchDraft({ transcript: heard, text: this.voiceBase.get() + heard })
      })
    );
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
          ...(result.transcript
            ? { transcript: result.transcript, text: this.voiceBase.get() + result.transcript }
            : {})
        });
      })
      .catch(() => {
        this.say('no microphone — type the note instead');
        this.patchDraft({ listening: false });
      });
  }, 'stopListening');

  /**
   * Start or stop recording: the screen AND what the app does, together.
   *
   * One switch, because they answer one question. A video with no timeline is
   * a screen capture anyone could have sent; a timeline with no video is a
   * list of names with nothing to point at. Pressing record asks for both.
   *
   * Nothing is recorded until this is pressed. The taps install here and come
   * out when it stops, so a session that never records never pays for one, and
   * a note that carries a timeline carries it because someone asked.
   *
   * The screen prompt may be refused, and that must not cost the timeline —
   * the semantic half is the half no other tool has. So the recorder starts
   * first and the video is allowed to fail behind it.
   *
   * Leaving it running is fine: `save()` stops it and attaches the result.
   */
  readonly toggleRecording = this.action(() => {
    if (this.recording.get()) {
      this.stopRecordingNow();
      return;
    }
    const draft = this.draft.get();
    if (!draft) return;
    this.recorder.install();
    this.recorder.startClip();
    this.errorCursor.set(activeErrorLog()?.entries().length ?? 0);
    this.recording.set(true);
    // The timeline is only readable against the state it started from, and
    // that state is NOW — not when the box was drawn, which may be minutes ago.
    this.patchDraft({ startState: stateTreeSnapshot(this.context.registry) });

    const capture = this.capture.get();
    if (!capture) return;
    this.hold('asking for screen capture…');
    void startVideo(() => capture.stream(), draft.anchor.rect)
      .then((session) => {
        // The prompt is modal and slow, and the recording may already be over
        // by the time it is answered — saved, discarded, or stopped. Adopting
        // the session then would leave a display capture running with nothing
        // left to attach it to.
        if (!this.recording.get()) {
          session.cancel();
          return;
        }
        this.video.set(session);
        this.filming.set(true);
        this.hold(null);
      })
      .catch(() => this.say('no screen video — still recording what the app does'));
  }, 'toggleRecording');

  /**
   * Reopen a note written this session, to change what it says.
   *
   * Everything captured comes back untouched — the same id, the same anchor,
   * the same timeline — so saving REPLACES that note rather than leaving a
   * near-duplicate beside it.
   */
  readonly editNote = this.action((note: SavedNote) => {
    const payload = note.payload;
    this.cancelVoice();
    this.cancelVideo();
    this.draft.set({
      anchor: payload.anchor,
      target: payload.target,
      nearby: payload.nearby,
      text: payload.text,
      label: payload.label,
      transcript: payload.voice?.transcript ?? '',
      listening: false,
      shot: null,
      audio: null,
      video: null,
      openedAt: payload.startedAt,
      startState: payload.startState,
      basedOn: payload
    });
    this.mode.set('composing');
    this.hold(null);
  }, 'editNote');

  /** Throw the draft away and go back to armed. */
  readonly discard = this.action(() => {
    this.cancelVoice();
    this.cancelRecording();
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
    // Read the clip BEFORE the taps come out: `deliver` builds the payload,
    // and an uninstalled recorder has nothing left to tell it.
    const timeline = this.recording.get() ? this.harvest(...this.clipWindow()) : [];
    const session = this.video.get();
    this.endRecording();
    if (!session) {
      this.deliver(draft, timeline);
      return;
    }
    this.video.set(null);
    this.filming.set(false);
    this.hold('finishing the recording…');
    void session
      .stop()
      .then((video) => this.deliver({ ...draft, video }, timeline))
      .catch(() => this.deliver(draft, timeline));
  }, 'save');

  /**
   * Send one finished note, and fall back to a download if nothing answers.
   *
   * Deciding from `canSave` instead would race the probe — arm, draw, type
   * fast, hit save, and a note would go to a file even though a sink was right
   * there. So this always tries the sink, and catches.
   */
  private deliver(draft: NoteDraft, timeline: readonly RecordedEvent[]): void {
    const payload = this.buildPayload(draft, timeline);
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
        this.remember(payload, handle, 'sink');
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

  /** Put a written note's handle back on the clipboard. */
  readonly copyHandle = this.action((note: SavedNote) => {
    if (!note.command) return;
    void copyToClipboard(note.command);
    this.say('copied');
  }, 'copyHandle');

  /** Take the snackbar away now, rather than waiting out its timer. */
  readonly dismissNotice = this.action(() => {
    this.hold(null);
  }, 'dismissNotice');

  /** The buffered timeline, for surfaces that show what is being recorded. */
  timeline(): readonly RecordedEvent[] {
    return this.recorder.timeline();
  }

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

  /**
   * Stop recording, keeping what it captured for the open draft.
   *
   * Public because Escape ends a recording without ending the note, and that
   * is a different thing from toggling: pressing Escape when nothing is
   * recording must not START one.
   */
  readonly stopRecording = this.action(() => {
    this.stopRecordingNow();
  }, 'stopRecording');

  /** The lifecycle itself, callable from inside another action. */
  private stopRecordingNow(): void {
    this.stopVideo();
    this.endRecording();
  }

  /** Drop a recording the draft it belonged to will never use. */
  private cancelRecording(): void {
    this.cancelVideo();
    this.endRecording();
  }

  /** Take the taps out and close the clip. Safe to call when nothing is running. */
  private endRecording(): void {
    if (!this.recording.get()) return;
    this.recorder.endClip();
    this.recorder.uninstall();
    this.recording.set(false);
  }

  /** The window a running clip covers: its first event (or its start) to now. */
  private clipWindow(): [number, number] {
    const started = this.recorder.clipStartedAt() ?? this.now();
    return [this.recorder.timeline()[0]?.at ?? started, this.now()];
  }

  /** Stop the screen video and keep it for the open draft. */
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

  /**
   * Assemble the payload that becomes `note.json` (and, projected, `note.md`).
   *
   * The timeline is passed IN rather than read here, because by the time this
   * runs the recorder has been stopped and its taps taken out.
   */
  private buildPayload(draft: NoteDraft, timeline: readonly RecordedEvent[]): NotePayload {
    const at = this.now();
    // A rewrite keeps its evidence: same id, same anchor, same timeline, same
    // state. Only the words are the author's to change.
    const based = draft.basedOn;
    if (based) {
      return {
        ...based,
        text: draft.text,
        label: draft.label,
        voice: draft.transcript
          ? {
              transcript: draft.transcript,
              hasAudio: based.voice?.hasAudio ?? false,
              source: 'speech-recognition'
            }
          : null
      };
    }
    const attachments = [
      ...(draft.shot ? ['shot.png'] : []),
      ...(draft.video ? ['clip.webm'] : []),
      ...(draft.audio ? ['audio.webm'] : [])
    ];
    // A note carries a timeline when someone pressed record, and not
    // otherwise. There is no evidence gate any more: the gate existed because
    // an always-on buffer filled a note with raw input that explained nothing,
    // and an explicit recording cannot have that problem. What was asked for
    // is what is saved, even if the app turned out to do nothing — "I pressed
    // record and it did nothing" is itself the finding.
    //
    // The start state travels with the timeline for the same reason: a list of
    // transitions is only readable against what the app held before them.
    const startState = timeline.length > 0 ? draft.startState : {};
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
    this.remember(payload, command, 'download');
    this.say('no sink reachable — note downloaded, read command copied');
    void copyToClipboard(command);
  }

  /** Add one written note to the session list the panel shows. */
  private remember(payload: NotePayload, command: string | null, delivery: 'sink' | 'download'): void {
    const entry: SavedNote = {
      id: payload.id,
      text: payload.text || payload.voice?.transcript || '(no words)',
      label: payload.label,
      command,
      delivery,
      payload
    };
    // A rewrite lands on the note it came from; the list is what EXISTS, not
    // a log of every time save was pressed.
    const existing = this.saved.get();
    const index = existing.findIndex((note) => note.id === entry.id);
    this.saved.set(
      index === -1
        ? [...existing, entry]
        : [...existing.slice(0, index), entry, ...existing.slice(index + 1)]
    );
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
