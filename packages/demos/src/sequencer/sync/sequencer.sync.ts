/**
 * Sequencer sync module — the shared client/server contract for the step
 * sequencer, and this repo's statement of the synced-vs-derived line in TIME
 * (the graph demo draws it in SPACE):
 *
 *   SYNCED (rows here): the PATTERN. Which tracks exist, what they are
 *     called, which voice each one plays, how loud it is, which of its
 *     sixteen steps are on, how hard each one hits, and the tempo everybody
 *     plays it at.
 *   DERIVED (never synced, never in an atom): the PLAYHEAD. Whether this
 *     browser is making sound, which step its AudioContext is on, and every
 *     scheduled audio event. Play/stop is deliberately LOCAL — a browser can
 *     only start audio after a gesture from the person sitting in front of
 *     it, so two peers hearing independent playheads over one shared pattern
 *     is the correct behavior, not a bug to fix.
 *
 * Id discipline (content/docs/server-advanced.mdx, "The four id rules") — the whole
 * story fits in one sentence: THIS MODULE MINTS NO IDS AT ALL.
 *   1. No handler calls `ctx.newId`, on any branch, so the client's and the
 *      server's id streams can never desynchronize. Every row that will ever
 *      exist — 4 tracks, 4×16 = 64 steps, 1 transport — is seeded by
 *      sequencer.server.ts, so toggling a step is an UPDATE, never a create.
 *      Rows are the grid; the grid has a fixed size.
 *   2. Nothing creates, so nothing needs an args-borne new id. `clearTrack`
 *      inverts by naming rows that already exist.
 *   3. The server authors no rows of its own.
 *   4. No field is server-assigned, so there are no pending sentinels.
 */
import { mutation, presence, query, t, table, type Infer, type InverseSpec, type MutationDecl } from 'wheel/sync';

/** How many steps one bar holds. Sixteenth notes, one bar, four to the beat. */
export const STEP_COUNT = 16;

/** The four synthesized drum voices. No samples: see audio/engine.ts. */
export const Voice = t.enum(['kick', 'snare', 'hat', 'clave']);

/**
 * One track — a lane of the grid. `position` is a float SORT KEY
 * (`positionBetween` territory) rather than an integer rank, so a reorder
 * never has to renumber its neighbours.
 */
export const TrackRow = t.object({
  id: t.string(),
  name: t.string(),
  voice: Voice,
  gain: t.number(),
  position: t.number()
});

/**
 * One cell of the grid. Every (track, index) pair has a row from the moment
 * the database is seeded, on or off — which is what makes toggling a step a
 * plain update and keeps the id story at "no ids are ever minted".
 */
export const StepRow = t.object({
  id: t.string(),
  trackId: t.string(),
  index: t.number(),
  on: t.boolean(),
  velocity: t.number()
});

/** The one shared transport row. Tempo is shared; the playhead is not. */
export const TransportRow = t.object({
  id: t.string(),
  bpm: t.number()
});

type Track = Infer<typeof TrackRow>;
type Step = Infer<typeof StepRow>;
type Transport = Infer<typeof TransportRow>;
export type { Track, Step, Transport };
export type VoiceName = Infer<typeof Voice>;

export const tracks = table({ name: 'tracks', type: TrackRow, key: (row) => row.id });
export const steps = table({ name: 'steps', type: StepRow, key: (row) => row.id });
export const transport = table({ name: 'transport', type: TransportRow, key: (row) => row.id });

/** The id of the single transport row, known to both sides and never minted. */
export const TRANSPORT_ID = 'transport_seed-main';

/** Every track, in lane order. */
export const trackList = query({
  name: 'tracks.all',
  params: t.object({}),
  into: tracks,
  projection: {
    filter: () => true,
    sort: (a, b) => a.position - b.position
  }
});

/** Every step cell, grouped by track and ordered within it — the grid, in row-major order. */
export const stepList = query({
  name: 'steps.all',
  params: t.object({}),
  into: steps,
  projection: {
    filter: () => true,
    sort: (a, b) => (a.trackId < b.trackId ? -1 : a.trackId > b.trackId ? 1 : a.index - b.index)
  }
});

/** The transport row (tempo). One row, but a query is still a list. */
export const transportQuery = query({
  name: 'transport.current',
  params: t.object({}),
  into: transport,
  projection: {
    filter: () => true,
    sort: (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  }
});

/**
 * Which cell this peer last touched, and whether their browser is currently
 * making sound. Presence, not rows: a peer scrubbing across the grid costs
 * zero history and zero undo entries, and `playing` is per-BROWSER state that
 * has no business in a shared database.
 */
export const sequencerPresence = presence({
  name: 'sequencer',
  state: t.object({
    trackId: t.string().nullable(),
    stepIndex: t.number().nullable(),
    playing: t.boolean()
  })
});

const ClearTrackArgs = t.object({ trackId: t.string() });
type ClearTrackArgs = Infer<typeof ClearTrackArgs>;

const RestoreStepsArgs = t.object({
  trackId: t.string(),
  steps: t.array(t.object({ stepId: t.string(), on: t.boolean(), velocity: t.number() }))
});
type RestoreStepsArgs = Infer<typeof RestoreStepsArgs>;

/**
 * Turn one cell on or off. The caller passes the value it wants rather than
 * "flip it", so a replay after a reconnect lands on the same pattern the user
 * saw rather than on whatever the parity happens to be at replay time.
 */
export const toggleStep = mutation({
  name: 'steps.toggle',
  args: t.object({ stepId: t.string(), on: t.boolean() }),
  optimistic: (cache, args) => {
    if (cache.get(steps, args.stepId)) {
      cache.update(steps, args.stepId, { on: args.on });
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(steps, args.stepId);
    return row === undefined
      ? null
      : { mutation: toggleStep, args: { stepId: args.stepId, on: row.on }, description: row.on ? 'clear step' : 'set step' };
  }
});

/**
 * How hard one cell hits (0…1), and whether it hits at all.
 *
 * `on` travels with the velocity ON PURPOSE: shift-clicking a dark cell means
 * "make this one hit, quietly", which is a single gesture and must therefore
 * be a single mutation and a single undo step. Splitting it into a toggle
 * plus a velocity write would make one shift-click cost two mod+z presses.
 */
export const setVelocity = mutation({
  name: 'steps.velocity',
  args: t.object({ stepId: t.string(), velocity: t.number(), on: t.boolean() }),
  optimistic: (cache, args) => {
    if (cache.get(steps, args.stepId)) {
      cache.update(steps, args.stepId, { velocity: args.velocity, on: args.on });
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(steps, args.stepId);
    return row === undefined
      ? null
      : {
          mutation: setVelocity,
          args: { stepId: args.stepId, velocity: row.velocity, on: row.on },
          description: 'set velocity'
        };
  }
});

/**
 * Silence a whole lane — sixteen rows written, ONE undo step. The inverse
 * carries the cells it turned off (and their velocities) so a single mod+z
 * puts the whole lane back exactly as it was: the same bulk-inverse shape as
 * the graph demo's `deleteNode` → `restoreNode`.
 */
export const clearTrack: MutationDecl<ClearTrackArgs> = mutation({
  name: 'tracks.clear',
  args: ClearTrackArgs,
  optimistic: (cache, args) => {
    for (const step of cache.list(steps)) {
      if (step.trackId === args.trackId && step.on) {
        cache.update(steps, step.id, { on: false });
      }
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const cleared = reader
      .list(steps)
      .filter((step) => step.trackId === args.trackId && step.on)
      .map((step) => ({ stepId: step.id, on: step.on, velocity: step.velocity }));
    return cleared.length === 0
      ? null // clearing an already-empty lane changed nothing; don't grow the stack
      : { mutation: restoreSteps, args: { trackId: args.trackId, steps: cleared }, description: 'clear track' };
  }
});

/** Put a cleared lane back cell for cell. The undo of a bulk clear. */
export const restoreSteps: MutationDecl<RestoreStepsArgs> = mutation({
  name: 'tracks.restore',
  args: RestoreStepsArgs,
  optimistic: (cache, args) => {
    for (const step of args.steps) {
      if (cache.get(steps, step.stepId)) {
        cache.update(steps, step.stepId, { on: step.on, velocity: step.velocity });
      }
    }
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: clearTrack,
    args: { trackId: args.trackId },
    description: 'restore track'
  })
});

/** Rename a lane. Inverse: the previous name. */
export const renameTrack = mutation({
  name: 'tracks.rename',
  args: t.object({ trackId: t.string(), name: t.string() }),
  optimistic: (cache, args) => {
    if (cache.get(tracks, args.trackId)) {
      cache.update(tracks, args.trackId, { name: args.name });
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(tracks, args.trackId);
    return row === undefined
      ? null
      : { mutation: renameTrack, args: { trackId: args.trackId, name: row.name }, description: 'rename track' };
  }
});

/**
 * A lane's level. NO `invert` ON PURPOSE, so this mutation is not undoable.
 *
 * The judgement: a gain slider is a mixer setting, not a document edit. A
 * drag emits many values, and folding them into the undo stack would mean
 * mod+z walks back through a dozen intermediate levels before it reaches the
 * step you actually wanted back. Everything the reader would call "an edit to
 * the pattern" (steps, velocity, clear, tempo, names) IS undoable; the mixer
 * is not. A mutation with no `invert` also leaves the redo stack alone, so
 * nudging a fader mid-history costs nothing.
 */
export const setGain = mutation({
  name: 'tracks.gain',
  args: t.object({ trackId: t.string(), gain: t.number() }),
  optimistic: (cache, args) => {
    if (cache.get(tracks, args.trackId)) {
      cache.update(tracks, args.trackId, { gain: args.gain });
    }
  }
});

/** The shared tempo. Undoable — it is part of the piece. Inverse: the old bpm. */
export const setBpm = mutation({
  name: 'transport.bpm',
  args: t.object({ bpm: t.number() }),
  optimistic: (cache, args) => {
    if (cache.get(transport, TRANSPORT_ID)) {
      cache.update(transport, TRANSPORT_ID, { bpm: args.bpm });
    }
  },
  invert: (reader, _args): InverseSpec | null => {
    const row = reader.get(transport, TRANSPORT_ID);
    return row === undefined ? null : { mutation: setBpm, args: { bpm: row.bpm }, description: 'set tempo' };
  }
});
