/**
 * The annotation data model — everything that lands in `note.json`.
 *
 * One rule shapes all of it: **an agent has to be able to read this cold.**
 * Every id here is a selector that works (`BoardCell:3-7` is what
 * `__wheel.component()` and `data-wheel-id` already use), every timestamp is
 * milliseconds from the same injected clock, and every value has been through
 * `serializeValue` — so the file always parses and never explodes.
 *
 * The shapes are deliberately flat and JSON-first. Nothing here holds a DOM
 * node, a function, or a live reference; a payload can sit in a buffer, cross
 * a `fetch`, and be read back a week later.
 */

/**
 * A rectangle in CSS pixels, in VIEWPORT coordinates.
 *
 * Viewport rather than document, because a note describes a MOMENT: this is
 * what was on screen, here, when I wrote this. It is not a bookmark into the
 * page, and nothing tries to make it survive scrolling.
 */
export interface NoteRect {
  /** Distance from the left edge of the viewport. */
  readonly x: number;
  /** Distance from the top edge of the viewport. */
  readonly y: number;
  /** Width in CSS pixels. */
  readonly width: number;
  /** Height in CSS pixels. */
  readonly height: number;
}

/**
 * What a note is about: the rectangle that was drawn, and what was under it.
 *
 * There is one anchor shape because there is one interaction — drawing the box
 * IS picking the target. What was underneath is described BOTH ways, because
 * the page may be a wheel app or may be plain prose:
 *
 * - as a component (`instanceId`, `name`, `ancestors`), for an app;
 * - as plain DOM (`domPath`, `element`, `text`), for a docs paragraph or a
 *   landing headline, where there is no component to name but there is very
 *   much something on the screen.
 *
 * Either half may be empty. Both are recorded whenever they exist, because the
 * agent reading the note later takes whichever the page actually had.
 */
export interface NoteAnchor {
  /** The rectangle that was drawn, in viewport coordinates at capture time. */
  readonly rect: NoteRect;
  /** The innermost component under the rectangle, when the page has any. */
  readonly instanceId: string | null;
  /** That component's manifest name (`BoardCell`), which survives renumbering. */
  readonly name: string | null;
  /** Its enclosing instance ids, outermost first. */
  readonly ancestors: readonly string[];
  /** A plain DOM path to the innermost element under the rectangle. */
  readonly domPath: string | null;
  /** A short description of that element (`h2.title`). */
  readonly element: string | null;
  /** A quote of its text — what identifies a paragraph when no component does. */
  readonly text: string | null;
}

/** One component captured alongside a note: identity, geometry, and what it held. */
export interface NoteTarget {
  /** The live instance id at capture time. */
  readonly instanceId: string;
  /** The manifest name. */
  readonly name: string;
  /** `connected` (a `connect()` component) or `view` (a dumb component's `use:viewRoot`). */
  readonly kind: 'connected' | 'view';
  /** The enclosing instance id, or null at a tree root. */
  readonly parentId: string | null;
  /** On-screen rectangle, or null when the component renders no DOM. */
  readonly rect: NoteRect | null;
  /** The connect shape's live values, projected. */
  readonly state: Record<string, unknown>;
  /** What the parent passed in, projected. */
  readonly props: Record<string, unknown>;
  /** The shape's action names — the write door an agent can drive. */
  readonly actions: readonly string[];
}

/** A named action ran. Arguments are projected, so this doubles as a replay instruction. */
export interface RecordedAction {
  /** Injected-clock timestamp. */
  readonly at: number;
  /** Discriminator. */
  readonly kind: 'action';
  /** Owning service class name. */
  readonly service: string;
  /** Action name as declared. */
  readonly action: string;
  /** Projected call arguments. */
  readonly args: readonly unknown[];
  /** How long the action body took, in milliseconds. */
  readonly durationMs: number;
}

/** An atom moved. Large values arrive as a changed-keys diff rather than two full copies. */
export interface RecordedState {
  /** Injected-clock timestamp of the last write in this entry. */
  readonly at: number;
  /** Discriminator. */
  readonly kind: 'state';
  /** Owning service class name. */
  readonly service: string;
  /** Atom name as declared. */
  readonly atom: string;
  /** Projected value before (absent when the entry is a diff). */
  readonly from?: unknown;
  /** Projected value after (absent when the entry is a diff). */
  readonly to?: unknown;
  /** Changed top-level keys, `{ key: { from, to } }`, for values too big to store whole. */
  readonly changed?: Record<string, { from: unknown; to: unknown }>;
  /** How many writes this entry coalesces (absent means one). */
  readonly count?: number;
}

/** A real user input, mapped to the component that owns the element it hit. */
export interface RecordedInput {
  /** Injected-clock timestamp. */
  readonly at: number;
  /** Discriminator. */
  readonly kind: 'input';
  /** DOM event type (`click`, `keydown`, `focusin`, …). */
  readonly type: string;
  /** The component under the event target, when one claims it. */
  readonly instanceId: string | null;
  /** A short description of the element itself (`button.primary`). */
  readonly target: string;
  /** Event-specific extras: pointer coordinates, the key pressed. */
  readonly detail: Record<string, unknown>;
}

/** A row changed in the sync client's cache, with the reason it changed. */
export interface RecordedWrite {
  /** Injected-clock timestamp from the provenance log. */
  readonly at: number;
  /** Discriminator. */
  readonly kind: 'write';
  /** Collection name. */
  readonly collection: string;
  /** Row id. */
  readonly rowId: string;
  /** Why the row moved — local mutation, server delta, rollback, hydrate. */
  readonly cause: string;
  /** The row after the write, projected; absent when the write deleted it. */
  readonly value?: unknown;
}

/** Something threw, warned, or rejected while the recording was running. */
export interface RecordedError {
  /** Injected-clock timestamp. */
  readonly at: number;
  /** Discriminator. */
  readonly kind: 'error';
  /** The error buffer's stable id (`err_7`) — the same id every other surface uses. */
  readonly id: string;
  /** The message as captured. */
  readonly message: string;
  /** Source-mapped stack, when one was resolved. */
  readonly stack: string | null;
}

/** The app navigated. */
export interface RecordedRoute {
  /** Injected-clock timestamp. */
  readonly at: number;
  /** Discriminator. */
  readonly kind: 'route';
  /** The URL after navigating. */
  readonly url: string;
}

/** A `fetch` went out and (usually) came back. */
export interface RecordedNetwork {
  /** Injected-clock timestamp of the request. */
  readonly at: number;
  /** Discriminator. */
  readonly kind: 'network';
  /** HTTP method. */
  readonly method: string;
  /** Request URL. */
  readonly url: string;
  /** Response status, or null when the request failed outright. */
  readonly status: number | null;
  /** Round-trip time in milliseconds. */
  readonly durationMs: number;
}

/** One entry in a recording's merged, time-ordered stream. */
export type RecordedEvent =
  | RecordedAction
  | RecordedState
  | RecordedInput
  | RecordedWrite
  | RecordedError
  | RecordedRoute
  | RecordedNetwork;

/**
 * Where notes are sent, and read back from.
 *
 * One URL, two methods, and that is the whole contract:
 *
 * - `POST <url>` — save one note. The body is
 *   `{ id, payload, markdown, png?, video?, audio? }`, where `payload` is a
 *   {@link NotePayload} and the media are `data:` URLs. Answer
 *   `{ ok: true, command?, location? }` — `command` is something pasteable
 *   (the dev server returns `read <path>/note.md`), `location` a URL where the
 *   note now lives. A non-ok answer, or none, makes the page fall back to
 *   downloading the note as one file.
 *
 *   `id` is the note's identity, not the request's: the page re-POSTs the same
 *   id when someone rewrites a note, and a sink must REPLACE that note rather
 *   than store a second one. A rewrite sends no media — what was captured is
 *   not re-captured — so keep the attachments already held under that id.
 * - `GET <url>` — the saved notes as `{ ok: true, notes: [{ id, payload }] }`,
 *   newest first. Nothing on the page needs the list; it is the capability
 *   probe, and answering at all is what tells the page saving is possible
 *   here rather than downloading.
 *
 * The default is the dev server's `/__wheel/note`, which writes a directory
 * per note. Point it somewhere else — a Durable Object, an issue tracker, a
 * bucket — and nothing else about the annotator changes.
 */
export interface AnnotateSink {
  /** Where notes are POSTed and listed. Same-origin path or absolute URL. */
  readonly url: string;
  /** Extra request headers, for a collector that needs an auth token. */
  readonly headers?: Record<string, string>;
}

/**
 * The small vocabulary a note can be tagged with — enough to sort by, short
 * enough to pick fast, and short enough that each one gets its own key.
 */
export type NoteLabel = 'bug' | 'question' | 'idea' | 'todo';

/** A voice note: the transcript is what the agent reads, the audio is the receipt. */
export interface NoteVoice {
  /** What speech recognition heard, after any hand edit. */
  readonly transcript: string;
  /** Whether `audio.webm` was saved beside the note. */
  readonly hasAudio: boolean;
  /** Whether the transcript came from the browser or was typed by hand after a failed attempt. */
  readonly source: 'speech-recognition' | 'typed';
}

/** Page-level facts worth having when the note is read out of context, weeks later. */
export interface NoteEnvironment {
  /** Full URL at capture time. */
  readonly url: string;
  /** Viewport width in CSS pixels. */
  readonly viewportWidth: number;
  /** Viewport height in CSS pixels. */
  readonly viewportHeight: number;
  /** Device pixel ratio — the difference between a real layout bug and a HiDPI artifact. */
  readonly devicePixelRatio: number;
  /** The browser's user-agent string. */
  readonly userAgent: string;
  /** Sync status at capture: connection state and pending writes. */
  readonly sync: Record<string, unknown> | null;
}

/**
 * A complete annotation. This IS `note.json`, and `note.md` is rendered from
 * it — nothing in the markdown is information the JSON lacks.
 */
export interface NotePayload {
  /** `<epoch-ms>-<slug>`; also the directory name on disk. */
  readonly id: string;
  /** When the note was saved. */
  readonly at: number;
  /** The typed note. Empty when the note is voice-only. */
  readonly text: string;
  /** The voice half, when there was one. */
  readonly voice: NoteVoice | null;
  /** What kind of remark this is. */
  readonly label: NoteLabel;
  /** The rectangle, and what was under it. */
  readonly anchor: NoteAnchor;
  /** The innermost component under the rectangle, with its live state. */
  readonly target: NoteTarget | null;
  /** Every other component under the rectangle, innermost first. */
  readonly nearby: readonly NoteTarget[];
  /** Where and on what this happened. */
  readonly environment: NoteEnvironment;
  /** The start of the recorded window — the oldest event the note carries. */
  readonly startedAt: number;
  /** The end of the recorded window: when the note was saved. */
  readonly endedAt: number;
  /**
   * What the app did during that window: actions, state changes, input, sync
   * writes, errors, routes, network.
   *
   * Every note carries one. The recorder keeps a rolling window from the
   * moment the annotator mounts, so the minute BEFORE you drew the box is in
   * here too — which is the minute the bug usually happened in.
   */
  readonly timeline: readonly RecordedEvent[];
  /**
   * Every service's atoms when the note was drawn.
   *
   * This is the half that makes a timeline re-runnable later: a list of
   * actions only replays against a known starting state.
   */
  readonly startState: Record<string, Record<string, unknown>>;
  /** Attachment file names written beside `note.json` (`shot.png`, `clip.webm`, `audio.webm`). */
  readonly attachments: readonly string[];
}
