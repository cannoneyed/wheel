/**
 * The sequencer's feature service: the ONLY place this demo touches synced
 * data, and the home of everything the audio engine is NOT allowed to own.
 *
 * The division of labour that makes a WebAudio app debuggable and testable:
 *
 *   HERE (rows + atoms, visible to `window.__wheel`, the debug panel and
 *   Playwright): the pattern. Which lanes exist, which cells are lit, how
 *   hard each one hits, the tempo, undo/redo availability, and which cell
 *   each peer last touched.
 *
 *   IN TransportService (a plain private field, never an atom): the
 *   AudioContext and its node graph. `Atom.set` deep-freezes on every write,
 *   so an AudioContext in an atom is a dead AudioContext.
 *
 * The seam between them is `pattern()` — a plain, non-reactive snapshot the
 * audio pump reads ~40×/second without ever subscribing to anything.
 */
import { type ServiceContext } from 'wheel/core';
import { SyncService } from 'wheel/sync';
import { KeyboardService } from 'wheel/kit';

import { clampBpm, type Pattern } from '../audio/scheduler';
import {
  STEP_COUNT,
  clearTrack,
  renameTrack,
  sequencerPresence,
  setBpm,
  setGain,
  setVelocity,
  stepList,
  toggleStep,
  trackList,
  transportQuery,
  type Step,
  type VoiceName
} from '../sync/sequencer.sync';

export { STEP_COUNT };
export type { VoiceName };

/** The three velocities a shift-click cycles through: ghost, normal, accent. */
export const VELOCITIES: readonly number[] = [0.4, 0.7, 1];

/** The tempo a client falls back to before the transport row has arrived. */
const FALLBACK_BPM = 120;

/** One cell of the grid, as the view wants it. */
export interface LaneCell {
  readonly id: string;
  readonly index: number;
  readonly on: boolean;
  readonly velocity: number;
}

/** One lane of the grid: a track row plus its sixteen cells, index-ordered. */
export interface Lane {
  readonly id: string;
  readonly name: string;
  readonly voice: VoiceName;
  readonly gain: number;
  readonly cells: readonly LaneCell[];
}

/** One peer's live position on the grid. */
export interface SequencerPeer {
  readonly clientId: string;
  readonly color: string;
  readonly trackId: string | null;
  readonly stepIndex: number | null;
  readonly playing: boolean;
}

/** Grid key for a cell, used by the peer-highlight lookup. */
export const cellKey = (trackId: string, index: number): string => `${trackId}:${index}`;

/** Stable per-peer color derived from the client id (same trick as the editor and graph demos). */
function peerColor(clientId: string): string {
  let hash = 0;
  for (let index = 0; index < clientId.length; index += 1) {
    hash = (hash * 31 + clientId.charCodeAt(index)) | 0;
  }
  // wheel-color: a peer's identity color is derived from their client id, so it cannot come from a fixed token — the whole point is that every peer gets a different hue.
  return `hsl(${((hash % 360) + 360) % 360} 78% 58%)`;
}

/** Owns all three subscriptions, every pattern mutation, and presence. */
export class SequencerService extends SyncService {
  constructor(context: ServiceContext) {
    super(context);
    const keyboardService = this.service(KeyboardService);
    this.addCleanup(
      keyboardService.register({
        id: 'sequencer.undo',
        key: 'mod+z',
        run: () => this.undo(),
        // Not gated on canUndo alone: a half-typed tempo is not a mutation
        // yet, and undo's own flush is what MAKES it one. While the toolbar
        // is mounted (a flush hook is registered) mod+z must reach undo().
        when: () => this.canUndo() || this.flushHook.get() !== null,
        inInputs: true
      })
    );
    this.addCleanup(
      keyboardService.register({
        id: 'sequencer.redo',
        key: 'mod+shift+z',
        run: () => this.redo(),
        when: this.canRedo,
        inInputs: true
      })
    );
  }

  /** Every lane. Read `.rows` / `.status` directly. */
  readonly tracks = this.liveQuery(trackList, {});
  /** Every cell of the grid — 4 lanes × 16 steps, all seeded, none ever created. */
  readonly steps = this.liveQuery(stepList, {});
  /** The one transport row (tempo). */
  readonly transport = this.liveQuery(transportQuery, {});

  // Runtime handles use fields. The
  // flush hook is the toolbar's "commit my half-typed tempo NOW" callback —
  // the same trick the editor demo uses for uncommitted keystrokes.
  private readonly flushHook = this.field<(() => void) | null>(null);

  // Presence is three facts published together, so a play/stop must not wipe
  // the cell the peer was last on. Fields track what we last sent without
  // making it state that a component can subscribe to.
  private readonly touchedTrackId = this.field<string | null>(null);
  private readonly touchedStepIndex = this.field<number | null>(null);
  private readonly playingFlag = this.field(false);

  /** The shared tempo, clamped to the playable range. */
  readonly bpm = this.computed((): number => clampBpm(this.transport.rows[0]?.bpm ?? FALLBACK_BPM), 'bpm');

  /**
   * The grid, assembled once per change: lanes in order, each carrying its
   * sixteen cells. Built HERE rather than in the component so the view is a
   * pair of nested `<For>`s over plain data with no keyed reads.
   */
  readonly lanes = this.computed((): readonly Lane[] => {
    const byTrack = new Map<string, Step[]>();
    for (const step of this.steps.rows) {
      const bucket = byTrack.get(step.trackId);
      if (bucket) {
        bucket.push(step);
      } else {
        byTrack.set(step.trackId, [step]);
      }
    }
    return this.tracks.rows.map((track) => ({
      id: track.id,
      name: track.name,
      voice: track.voice,
      gain: track.gain,
      cells: (byTrack.get(track.id) ?? [])
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((step) => ({ id: step.id, index: step.index, on: step.on, velocity: step.velocity }))
    }));
  }, 'lanes');

  /** How many lanes the pattern has (a DOM mirror for tests). */
  readonly trackCount = this.computed((): number => this.tracks.rows.length, 'trackCount');
  /** How many cells are currently lit — the pattern's "size", in the sidebar. */
  readonly activeCount = this.computed(
    (): number => this.steps.rows.reduce((total, step) => total + (step.on ? 1 : 0), 0),
    'activeCount'
  );

  /** Whether an invertible local mutation is available to undo. */
  readonly canUndo = this.clientRead((): boolean => this.client.canUndo());
  /** Whether an undone mutation is available to redo. */
  readonly canRedo = this.clientRead((): boolean => this.client.canRedo());

  /** Peers on this pattern right now, with their last-touched cell and playing state. */
  readonly peers = this.clientRead((): readonly SequencerPeer[] =>
    [...this.client.peers(sequencerPresence).valid.entries()].map(([clientId, state]) => ({
      clientId,
      color: peerColor(clientId),
      trackId: state.trackId,
      stepIndex: state.stepIndex,
      playing: state.playing
    }))
  );

  /** How many peers are on this pattern (mirrored into the toolbar). */
  readonly peerCount = this.computed((): number => this.peers().length, 'peerCount');
  /** How many peers currently have their own playhead running. */
  readonly playingPeerCount = this.computed(
    (): number => this.peers().filter((peer) => peer.playing).length,
    'playingPeerCount'
  );

  /**
   * Cell key → the color of a peer sitting on it. A plain record so the grid
   * can look a cell up during render without a keyed reactive read.
   */
  readonly peerCells = this.computed((): Readonly<Record<string, string>> => {
    const marks: Record<string, string> = {};
    for (const peer of this.peers()) {
      if (peer.trackId !== null && peer.stepIndex !== null) {
        marks[cellKey(peer.trackId, peer.stepIndex)] = peer.color;
      }
    }
    return marks;
  }, 'peerCells');

  /**
   * A plain, NON-REACTIVE snapshot of everything the audio pump needs. Called
   * from a timer ~40×/second: it runs outside any reactive scope, so it reads
   * the current rows without subscribing to them.
   */
  readonly pattern = (): Pattern => ({
    bpm: this.bpm(),
    lanes: this.lanes().map((lane) => ({
      trackId: lane.id,
      voice: lane.voice,
      gain: lane.gain,
      cells: lane.cells.map((cell) => ({ on: cell.on, velocity: cell.velocity }))
    }))
  });

  /** The toolbar registers its commit-the-typed-tempo callback here. */
  registerFlushHook(hook: () => void): () => void {
    this.flushHook.set(hook);
    return () => {
      if (this.flushHook.get() === hook) {
        this.flushHook.set(null);
      }
    };
  }

  /** Turn one cell on or off. One click, one mutation, one undo step. */
  readonly toggleStep = (stepId: string): void => {
    const row = this.steps.rows.find((step) => step.id === stepId);
    if (row) {
      this.mutate(toggleStep, { stepId, on: !row.on });
    }
  };

  /**
   * Cycle a cell through ghost → normal → accent (shift-click). A dark cell
   * comes on at the quietest level — ONE gesture, ONE mutation, ONE undo
   * step, which is why `on` rides along in the velocity mutation's args.
   */
  readonly cycleVelocity = (stepId: string): void => {
    const row = this.steps.rows.find((step) => step.id === stepId);
    if (!row) {
      return;
    }
    if (!row.on) {
      this.mutate(setVelocity, { stepId, velocity: VELOCITIES[0]!, on: true });
      return;
    }
    const current = VELOCITIES.findIndex((value) => Math.abs(value - row.velocity) < 0.05);
    this.mutate(setVelocity, {
      stepId,
      velocity: VELOCITIES[(current + 1) % VELOCITIES.length]!,
      on: true
    });
  };

  /** Silence a whole lane — sixteen rows written, ONE undo step. */
  readonly clearTrack = (trackId: string): void => {
    this.mutate(clearTrack, { trackId });
  };

  /** Rename a lane. No-op edits never reach the undo stack. */
  readonly renameTrack = (trackId: string, name: string): void => {
    const row = this.tracks.rows.find((track) => track.id === trackId);
    const next = name.trim();
    if (!row || next === '' || row.name === next) {
      return;
    }
    this.mutate(renameTrack, { trackId, name: next });
  };

  /** Set a lane's level. Synced, but deliberately NOT undoable (see sequencer.sync.ts). */
  readonly setGain = (trackId: string, gain: number): void => {
    this.mutate(setGain, { trackId, gain: Math.min(1, Math.max(0, gain)) });
  };

  /** Set the shared tempo. Undoable — the tempo is part of the piece. */
  readonly setBpm = (bpm: number): void => {
    const next = clampBpm(bpm);
    if (next !== this.bpm()) {
      this.mutate(setBpm, { bpm: next });
    }
  };

  /**
   * Publish the cell this client just touched. Coalesced at 60ms so dragging
   * across the grid costs a few small WebSocket messages and zero rows.
   */
  readonly publishTouch = (trackId: string | null, stepIndex: number | null): void => {
    this.touchedTrackId.set(trackId);
    this.touchedStepIndex.set(stepIndex);
    this.publishPresence();
  };

  /**
   * Publish whether this browser is making sound. Sent immediately — it is a
   * rare, meaningful transition, not a stream.
   */
  readonly publishPlaying = (playing: boolean): void => {
    this.playingFlag.set(playing);
    this.publishPresence(true);
  };

  private publishPresence(immediate = false): void {
    this.client.setPresence(
      sequencerPresence,
      {
        trackId: this.touchedTrackId.get(),
        stepIndex: this.touchedStepIndex.get(),
        playing: this.playingFlag.get()
      },
      immediate ? undefined : { coalesceMs: 60 }
    );
  }

  /**
   * Undo: flush a half-typed tempo FIRST — it becomes the newest undo entry —
   * then undo. The same D1 trick the editor uses for uncommitted keystrokes.
   */
  readonly undo = (): void => {
    this.flushHook.get()?.();
    this.client.undo();
  };

  /** Redo the newest undone mutation. */
  readonly redo = (): void => {
    this.client.redo();
  };
}
