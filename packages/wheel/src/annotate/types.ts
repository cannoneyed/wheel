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

/** A viewport-space rectangle in CSS pixels, as measured at capture time. */
export interface NoteRect {
  /** Distance from the viewport's left edge. */
  readonly x: number;
  /** Distance from the viewport's top edge. */
  readonly y: number;
  /** Width in CSS pixels. */
  readonly width: number;
  /** Height in CSS pixels. */
  readonly height: number;
}

/**
 * What a note is attached to.
 *
 * `instance` is the good case and the one to aim for: a component id that is
 * stable across reloads and list reorders (`require-stable-instance-name`
 * exists to keep it that way). `region` is a dragged rectangle that may cover
 * several components. `page` is a note about the screen as a whole.
 *
 * Every anchor also records the weaker signals — ancestors, rect, DOM path —
 * because that is what makes re-finding the target degrade gracefully instead
 * of failing (see `resolveAnchor`).
 */
export interface NoteAnchor {
  /**
   * How the target was chosen.
   *
   * `element` is the one for pages wheel does not own — a docs page, a landing
   * scroll. There is no component to name, so the anchor leans on the DOM path
   * and a quote of the text, which is what actually identifies a paragraph.
   */
  readonly kind: 'instance' | 'element' | 'region' | 'page';
  /** The component instance id, when one was picked. */
  readonly instanceId: string | null;
  /** The component's manifest name (`BoardCell`), which survives renumbering. */
  readonly name: string | null;
  /** Enclosing instance ids, outermost first — the fallback when the exact id is gone. */
  readonly ancestors: readonly string[];
  /** Where it was on screen when the note was written. */
  readonly rect: NoteRect | null;
  /** A plain DOM path, for the case where no component claims the element at all. */
  readonly domPath: string | null;
  /** A short description of the element itself (`h2.title`), for element anchors. */
  readonly element: string | null;
  /**
   * A quote of the target's text.
   *
   * Prose has no ids. When a docs paragraph moves, the sentence is what finds
   * it again — the same trick a comment system uses to survive an edit.
   */
  readonly text: string | null;
}

/** How well an anchor still resolves against the live component tree. */
export type AnchorMatch = 'exact' | 'renamed' | 'orphaned';

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
  /** Table name. */
  readonly table: string;
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

/** The small vocabulary a note can be tagged with — enough to sort by, short enough to pick fast. */
export type NoteLabel = 'bug' | 'question' | 'idea' | 'todo' | 'looks-good';

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
  /** A point-in-time note, or a recorded interval. */
  readonly kind: 'note' | 'clip';
  /** When the note was saved. */
  readonly at: number;
  /** The typed note. Empty when the note is voice-only. */
  readonly text: string;
  /** The voice half, when there was one. */
  readonly voice: NoteVoice | null;
  /** What kind of remark this is. */
  readonly label: NoteLabel;
  /** What it is attached to. */
  readonly anchor: NoteAnchor;
  /** The anchored component's own state, when the anchor named one. */
  readonly target: NoteTarget | null;
  /** Other components under the anchor's rectangle, innermost first. */
  readonly nearby: readonly NoteTarget[];
  /** Where and on what this happened. */
  readonly environment: NoteEnvironment;
  /** Clips only: when recording started. */
  readonly startedAt: number | null;
  /** Clips only: when recording stopped. */
  readonly endedAt: number | null;
  /** The merged event stream (empty for a bare note). */
  readonly timeline: readonly RecordedEvent[];
  /**
   * Clips only: every service's atoms at the moment recording started.
   *
   * This is the half that makes replay possible later — a timeline of actions
   * is only re-runnable against a known starting state.
   */
  readonly startState: Record<string, Record<string, unknown>> | null;
  /** Attachment file names written beside `note.json` (`shot.png`, `clip.webm`, `audio.webm`). */
  readonly attachments: readonly string[];
}
