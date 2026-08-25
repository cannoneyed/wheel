/**
 * `AnnotateService` — the whole annotation flow as one state machine.
 *
 *   off ──arm──▶ armed ──pick──▶ composing ──save──▶ (written to disk) ──▶ armed
 *                  │                  ▲
 *                  └──record ▶ recording ┘   (stop opens the composer with the clip attached)
 *
 * Two things are worth knowing before reading the code:
 *
 * **The recorder runs before you press anything.** In dev the taps go in when
 * `WheelAnnotate` MOUNTS, keeping a rolling 60-second buffer for the whole
 * session — so "that just happened and I didn't hit record" is recoverable
 * with `saveRetro()`. Starting the buffer at arm time would be useless: by
 * then the thing you wanted has already happened.
 *
 * **Saving is a plain POST to the dev server**, which writes a directory of
 * files under `.wheel/notes/`. That is the whole delivery mechanism: an agent
 * reads files. The response carries a one-line command that goes straight to
 * the clipboard, so handing a note over is one paste.
 *
 * Everything that touches hardware (pixels, microphone, video) is injected —
 * the service itself is deterministic and testable with no browser at all.
 */
import { Service } from '../core/services';
import { logger } from '../core/logger';
import { serializeValue } from '../core/serialize';
import type { InstanceRecord } from '../core/debug-registry';
import type { SyncClient } from '../sync/client/client';
import { activeErrorLog } from '../debug/error-capture';

import { anchorToInstance, anchorToPage, anchorToRegion, resolveAnchor, targetOf, targetsUnder } from './anchor';
import { Recorder, stateTreeSnapshot } from './recorder';
import { annotateRecorder, startAnnotateSession } from './session';
import { downloadNote } from './download';
import { noteId, renderNoteFile, renderNoteMarkdown } from './note-format';
import { startVideo, startVoice, type VideoSession, type VoiceSession } from './media';
import type { NoteAnchor, NoteLabel, NotePayload, NoteRect, NoteTarget, RecordedEvent } from './types';

/** The dev-server endpoint the annotator posts to and probes. */
const NOTE_ENDPOINT = '/__wheel/note';

/** The dev-server endpoint that lists saved notes, so pins survive a reload. */
const NOTES_ENDPOINT = '/__wheel/notes';

/** How many components around the anchor a region note keeps. */
const NEARBY_LIMIT = 12;

/** How far back a clip reaches into the provenance log when harvesting writes. */
const PROVENANCE_HARVEST = 500;

/** Projection depth for a synced row's value in the timeline. */
const WRITE_DEPTH = 4;

/** Where the flow currently is. */
export type AnnotateMode = 'off' | 'armed' | 'region' | 'composing';

/** A note being written: everything captured so far, none of it saved yet. */
export interface NoteDraft {
  /** What the note will attach to. */
  readonly anchor: NoteAnchor;
  /** The anchored component's captured state, when the anchor named one. */
  readonly target: NoteTarget | null;
  /** Other components under the anchor's rectangle. */
  readonly nearby: readonly NoteTarget[];
  /** Typed note text. */
  readonly text: string;
  /** What kind of remark this is. */
  readonly label: NoteLabel;
  /** Live speech transcript, editable before save. */
  readonly transcript: string;
  /** Whether a voice session is capturing right now. */
  readonly listening: boolean;
  /** `data:image/png;base64,…` of the anchored region. */
  readonly shot: string | null;
  /** `data:audio/webm;base64,…` from the microphone. */
  readonly audio: string | null;
  /** `data:video/webm;base64,…` for a clip. */
  readonly video: string | null;
  /** Clip start, or null for a point-in-time note. */
  readonly startedAt: number | null;
  /** Clip end, or null for a point-in-time note. */
  readonly endedAt: number | null;
  /** The merged event stream harvested for this draft. */
  readonly timeline: readonly RecordedEvent[];
  /** Every service's atoms at clip start — the half replay would need. */
  readonly startState: Record<string, Record<string, unknown>> | null;
}

/** A saved note as the dev server hands it back, for rendering pins. */
export interface SavedNote {
  /** Directory name and payload id. */
  readonly id: string;
  /** The stored payload. */
  readonly payload: NotePayload;
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
  /** True while a clip is recording. */
  readonly recording = this.atom(false, 'recording');
  /** The component the picker is hovering. */
  readonly hovered = this.atom<string | null>(null, 'hovered');
  /** Notes already on disk, for pins. */
  readonly notes = this.atom<readonly SavedNote[]>([], 'notes');
  /** True once the dev server answered the capability probe. */
  readonly canSave = this.atom(false, 'canSave');
  /** Absolute directory of the last save. */
  readonly savedTo = this.atom<string | null>(null, 'savedTo');
  /** The copy-and-paste command for the last save (`read .wheel/notes/…/note.md`). */
  readonly lastCommand = this.atom<string | null>(null, 'lastCommand');
  /**
   * What the environment could not give this note — no screen capture, no
   * microphone, no video.
   *
   * Deliberately NOT an error. A headless browser, a denied permission and a
   * browser without speech recognition are all normal, and routing them
   * through `logger` would fill the error buffer that exists to make real
   * breakage unmissable. The note is still worth saving without pixels; the
   * composer just says what is missing.
   */
  readonly notice = this.atom<string | null>(null, 'notice');

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

  /** Wire the sync client and the capture seams. Called once by `WheelAnnotate`. */
  readonly attach = this.action((client: SyncClient | null, capture: AnnotateCapture) => {
    this.client.set(client);
    this.capture.set(capture);
  }, 'attach');

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

  /** Turn annotation mode on: pins appear and the picker goes live. */
  readonly arm = this.action(() => {
    if (this.mode.get() !== 'off') return;
    this.mode.set('armed');
    this.probe();
    this.loadNotes();
  }, 'arm');

  /**
   * Leave annotation mode: drops any draft and stops any recording.
   *
   * In dev the taps stay installed, because the retro buffer is a property of
   * the session rather than of the chrome. In production they come out.
   */
  readonly disarm = this.action(() => {
    this.cancelVoice();
    this.video.get()?.cancel();
    this.video.set(null);
    this.recorder.endClip();
    this.recording.set(false);
    this.draft.set(null);
    this.hovered.set(null);
    this.mode.set('off');
  }, 'disarm');

  /** Unmount: disarm. The session recorder keeps running; `stopAnnotateSession` ends it. */
  readonly endSession = this.action(() => {
    this.disarm();
  }, 'endSession');

  /** Highlight-follows-cursor while the picker is live. */
  readonly hover = this.action((instanceId: string | null) => {
    this.hovered.set(instanceId);
  }, 'hover');

  /** Attach a note to one component instance and open the composer. */
  readonly pickInstance = this.action((instanceId: string) => {
    const record = this.context.registry.instance(instanceId);
    if (!record) {
      logger.warn(`wheel: annotate could not find instance '${instanceId}'`);
      return;
    }
    this.openComposer(anchorToInstance(this.context.registry, record), record);
  }, 'pickInstance');

  /** Raise the marquee: the next drag becomes a region note. */
  readonly startRegion = this.action(() => {
    this.mode.set('region');
  }, 'startRegion');

  /** Attach a note to a dragged rectangle and open the composer. */
  readonly pickRegion = this.action((rect: NoteRect) => {
    this.openComposer(anchorToRegion(this.context.registry, rect), null, rect);
  }, 'pickRegion');

  /** Attach a note to the screen as a whole and open the composer. */
  readonly pickPage = this.action(() => {
    this.openComposer(anchorToPage(), null);
  }, 'pickPage');

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
        this.notice.set('no microphone — type the note instead');
        this.patchDraft({ listening: false });
      });
  }, 'stopListening');

  /**
   * Start a clip. The taps are already running; this pins the buffer (no more
   * age-based pruning), snapshots the starting state, and starts the video.
   *
   * A refused screen-capture prompt is NOT a failure: the timeline is the
   * recording, the video only illustrates it.
   */
  readonly startClip = this.action(() => {
    if (this.recording.get()) return;
    this.recorder.install();
    this.recorder.startClip(this.now());
    this.errorCursor.set(activeErrorLog()?.entries().length ?? 0);
    this.recording.set(true);
    const capture = this.capture.get();
    if (capture) {
      void startVideo(() => capture.stream())
        .then((session) => this.video.set(session))
        .catch(() => this.notice.set('no video — the timeline is recording all the same'));
    }
  }, 'startClip');

  /** Stop the clip and open the composer with the whole recording attached. */
  readonly stopClip = this.action(() => {
    if (!this.recording.get()) return;
    const startedAt = this.recorder.clipStartedAt() ?? this.now();
    const endedAt = this.now();
    this.recording.set(false);
    this.recorder.endClip();
    const startState = stateTreeSnapshot(this.context.registry);
    this.openComposer(anchorToPage(), null, null, {
      startedAt,
      endedAt,
      timeline: this.harvest(startedAt, endedAt),
      startState
    });
    const session = this.video.get();
    this.video.set(null);
    if (session) {
      void session
        .stop()
        .then((video) => this.patchDraft({ video }))
        .catch(() => this.notice.set('no video — the timeline is complete without it'));
    }
  }, 'stopClip');

  /**
   * Turn the rolling retro buffer into a clip — the "that just happened and I
   * didn't press record" door. Everything still in the buffer becomes the
   * timeline.
   */
  readonly saveRetro = this.action(() => {
    const timeline = this.recorder.timeline();
    const startedAt = timeline[0]?.at ?? this.now();
    const endedAt = this.now();
    this.openComposer(anchorToPage(), null, null, {
      startedAt,
      endedAt,
      timeline: this.harvest(startedAt, endedAt),
      startState: stateTreeSnapshot(this.context.registry)
    });
  }, 'saveRetro');

  /** Throw the draft away and go back to armed. */
  readonly discard = this.action(() => {
    this.cancelVoice();
    this.draft.set(null);
    this.mode.set('armed');
  }, 'discard');

  /**
   * Write the note: POST the payload, then put the read-this-file command on
   * the clipboard so handing it to an agent is one paste.
   */
  readonly save = this.action(() => {
    const draft = this.draft.get();
    if (!draft) return;
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
    // Try the dev server; fall back to a download. Deciding from the probe
    // instead would race it — arm, type fast, hit save, and a note would go to
    // a file even though a server was right there.
    void fetch(NOTE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`note endpoint answered ${response.status}`);
        const result = (await response.json()) as { ok: boolean; dir?: string; command?: string; error?: string };
        if (!result.ok) throw new Error(result.error ?? 'note endpoint refused the note');
        this.savedTo.set(result.dir ?? null);
        this.lastCommand.set(result.command ?? null);
        if (result.command) void copyToClipboard(result.command);
        this.loadNotes();
      })
      .catch(() => this.deliverAsDownload(payload, draft.shot));
  }, 'save');

  /** Re-read the notes on disk (pins). */
  readonly loadNotes = this.action(() => {
    void fetch(NOTES_ENDPOINT)
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as { ok: boolean; notes?: SavedNote[] };
        if (result.ok && result.notes) this.notes.set(result.notes);
      })
      .catch(() => {
        // No dev server (a production page, a static preview): pins simply do
        // not exist there. Saving already reports its own failure.
      });
  }, 'loadNotes');

  /** Put a saved note's read command back on the clipboard. */
  readonly copyCommand = this.action((id: string) => {
    void copyToClipboard(`read .wheel/notes/${id}/note.md`);
  }, 'copyCommand');

  /** Where a saved note's pin belongs now, and how well its anchor still resolves. */
  pinFor(note: SavedNote): { rect: NoteRect; match: 'exact' | 'renamed' | 'orphaned' } | null {
    const resolved = resolveAnchor(this.context.registry, note.payload.anchor);
    if (resolved.record) {
      for (const element of resolved.record.elements) {
        if (element.isConnected) {
          const rect = element.getBoundingClientRect();
          return {
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            match: resolved.match
          };
        }
      }
    }
    const fallback = note.payload.anchor.rect;
    return fallback ? { rect: fallback, match: 'orphaned' } : null;
  }

  /** The buffered timeline, for surfaces that show what is being recorded. */
  timeline(): readonly RecordedEvent[] {
    return this.recorder.timeline();
  }

  /** The mounted component that owns an element — what the picker points at. */
  instanceAt(element: Element): InstanceRecord | undefined {
    return this.context.registry.instanceAt(element);
  }

  /** Open the composer with an anchor, capturing state, pixels and neighbours. */
  private openComposer(
    anchor: NoteAnchor,
    record: InstanceRecord | null,
    rect: NoteRect | null = null,
    clip?: {
      startedAt: number;
      endedAt: number;
      timeline: readonly RecordedEvent[];
      startState: Record<string, Record<string, unknown>>;
    }
  ): void {
    const registry = this.context.registry;
    const region = rect ?? anchor.rect;
    this.draft.set({
      anchor,
      target: record ? targetOf(registry, record) : null,
      nearby: region ? targetsUnder(registry, region, NEARBY_LIMIT) : [],
      text: '',
      label: 'bug',
      transcript: '',
      listening: false,
      shot: null,
      audio: null,
      video: null,
      startedAt: clip?.startedAt ?? null,
      endedAt: clip?.endedAt ?? null,
      timeline: clip?.timeline ?? [],
      startState: clip?.startState ?? null
    });
    this.mode.set('composing');
    this.hovered.set(null);
    this.notice.set(null);
    if (region) this.captureRegion(region);
  }

  /** Grab the pixels for a draft's rectangle; a failure just means no image. */
  private captureRegion(rect: NoteRect): void {
    const capture = this.capture.get();
    if (!capture) return;
    void capture
      .region(rect)
      .then((shot) => this.patchDraft({ shot }))
      .catch(() => this.notice.set('no screenshot — this browser or tab refused screen capture'));
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
   * The recorder's own events plus the two streams the app already records for
   * itself: sync writes (the provenance log) and errors (the capture buffer).
   */
  private harvest(from: number, to: number): RecordedEvent[] {
    const extra: RecordedEvent[] = [];
    const client = this.client.get();
    if (client) {
      for (const write of client.recentWrites(PROVENANCE_HARVEST)) {
        const cause = write.cause;
        extra.push({
          at: write.at,
          kind: 'write',
          table: write.table,
          rowId: write.rowId,
          cause: 'mutation' in cause ? `${cause.kind}:${cause.mutation}` : cause.kind,
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
    return {
      id: noteId(at, draft.text || draft.transcript, draft.anchor.name),
      kind: draft.startedAt === null ? 'note' : 'clip',
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
      startedAt: draft.startedAt,
      endedAt: draft.endedAt,
      timeline: draft.timeline,
      startState: draft.startState,
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
    void copyToClipboard(command);
  }

  /** Ask the dev server whether saving is possible at all. */
  private probe(): void {
    void fetch(NOTE_ENDPOINT, { method: 'GET' })
      .then((response) => this.canSave.set(response.ok))
      .catch(() => this.canSave.set(false));
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
