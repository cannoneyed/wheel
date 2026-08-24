/**
 * Sequencer server bindings — the authoritative half of sequencer.sync.ts.
 * Every handler mirrors its optimistic twin write-for-write, and (id rule 1)
 * none of them mints an id on any branch, because there is nothing to mint:
 * the seed below writes every row this demo will ever have.
 *
 * SQLite dialect notes that bite here (content/docs/server-advanced.mdx):
 *   - `on` and `index` are reserved words, so the columns are written `"on"`
 *     and `"index"` everywhere, and the query aliases them back to the row's
 *     field names. Same trick sheet.server.ts uses for `"row"`.
 *   - `on` is an `integer` boolean; the backend coerces 0/1 back to real
 *     booleans at its read seam, so schema validation still sees a boolean.
 *   - `gain`, `velocity`, `position` and `bpm` are `real` — levels are
 *     fractions and positions are sort keys that live between neighbours.
 */
import { sql } from 'wheel/sync';
import { serveMutation, serveQuery } from 'wheel/sync/server';

import {
  STEP_COUNT,
  TRANSPORT_ID,
  clearTrack,
  renameTrack,
  restoreSteps,
  setBpm,
  setGain,
  setVelocity,
  stepList,
  toggleStep,
  trackList,
  transportQuery
} from './sequencer.sync';

/** One seeded lane: the voice, its level, and the steps that start switched on. */
interface SeedTrack {
  readonly voice: string;
  readonly name: string;
  readonly gain: number;
  /** `[stepIndex, velocity]` for every cell that starts on. */
  readonly hits: ReadonlyArray<readonly [index: number, velocity: number]>;
}

/**
 * The seeded bar: a one-bar house pattern with a son-clave top line, chosen
 * because it is instantly recognizable as MUSIC rather than as a test
 * fixture — the demo has to sound like something the first time you press
 * play.
 *
 *          1 e & a 2 e & a 3 e & a 4 e & a
 *   kick   x . . . x . . . x . x . x . . .
 *   snare  . . . . x . . . . . . . x . . x
 *   hat    x . x . x . x . x . x . x . x .
 *   clave  x . . x . . x . . . x . x . . .
 */
const SEED_TRACKS: readonly SeedTrack[] = [
  {
    voice: 'kick',
    name: 'kick',
    gain: 1,
    hits: [
      [0, 1],
      [4, 1],
      [8, 1],
      [10, 0.6],
      [12, 1]
    ]
  },
  {
    voice: 'snare',
    name: 'snare',
    gain: 0.85,
    hits: [
      [4, 1],
      [12, 1],
      [15, 0.45]
    ]
  },
  {
    voice: 'hat',
    name: 'hat',
    gain: 0.5,
    hits: [
      [0, 0.9],
      [2, 0.45],
      [4, 0.9],
      [6, 0.45],
      [8, 0.9],
      [10, 0.45],
      [12, 0.9],
      [14, 0.45]
    ]
  },
  {
    voice: 'clave',
    name: 'clave',
    gain: 0.6,
    hits: [
      [0, 0.8],
      [3, 0.8],
      [6, 0.8],
      [10, 0.8],
      [12, 0.8]
    ]
  }
];

/** The tempo a fresh database starts at. */
const SEED_BPM = 120;

/** Stable row id for a seeded lane. */
const trackId = (voice: string): string => `track_seed-${voice}`;

/**
 * Stable row id for one cell. Zero-padded so the ids sort the same way the
 * indices do — the client's projection sorts on `index`, but a human reading
 * the debug panel's table view sorts on the id.
 */
const stepId = (voice: string, index: number): string =>
  `step_seed-${voice}-${String(index).padStart(2, '0')}`;

/** Every cell of the grid as an INSERT tuple: 4 lanes × 16 steps, on or off. */
function seedStepValues(): string {
  const rows: string[] = [];
  for (const track of SEED_TRACKS) {
    const hits = new Map(track.hits);
    for (let index = 0; index < STEP_COUNT; index += 1) {
      const velocity = hits.get(index);
      rows.push(
        `('${stepId(track.voice, index)}', '${trackId(track.voice)}', ${index}, ${
          velocity === undefined ? 0 : 1
        }, ${velocity ?? 0.8})`
      );
    }
  }
  return rows.join(', ');
}

/**
 * Schema + seed for a fresh SQLite database. Written as data rather than as
 * 69 hand-typed INSERTs so the pattern above stays readable and the ids are
 * derived, never typed twice.
 */
export const SEQUENCER_SCHEMA = {
  create: [
    `create table tracks (
       id text primary key,
       name text not null,
       voice text not null,
       gain real not null default 1,
       position real not null default 0)`,
    `create table steps (
       id text primary key,
       track_id text not null,
       "index" integer not null,
       "on" integer not null default 0,
       velocity real not null default 0.8)`,
    `create table transport (
       id text primary key,
       bpm real not null default ${SEED_BPM})`
  ],
  seed: [
    `insert into tracks (id, name, voice, gain, position) values ${SEED_TRACKS.map(
      (track, lane) => `('${trackId(track.voice)}', '${track.name}', '${track.voice}', ${track.gain}, ${lane})`
    ).join(', ')}`,
    `insert into steps (id, track_id, "index", "on", velocity) values ${seedStepValues()}`,
    `insert into transport (id, bpm) values ('${TRANSPORT_ID}', ${SEED_BPM})`
  ]
};

export const trackListServer = serveQuery({
  query: trackList,
  sql: () => sql`select id, name, voice, gain, position from tracks order by position`,
  rerunOn: ['tracks']
});

export const stepListServer = serveQuery({
  query: stepList,
  sql: () => sql`select id, track_id as "trackId", "index" as "index", "on" as "on", velocity
                 from steps order by track_id, "index"`,
  rerunOn: ['steps']
});

export const transportServer = serveQuery({
  query: transportQuery,
  sql: () => sql`select id, bpm from transport order by id`,
  rerunOn: ['transport']
});

export const toggleStepServer = serveMutation({
  mutation: toggleStep,
  handler: async (tx, args) => {
    await tx.sql`update steps set "on" = ${args.on ? 1 : 0} where id = ${args.stepId}`;
  }
});

export const setVelocityServer = serveMutation({
  mutation: setVelocity,
  handler: async (tx, args) => {
    await tx.sql`update steps set velocity = ${args.velocity}, "on" = ${args.on ? 1 : 0}
                 where id = ${args.stepId}`;
  }
});

export const clearTrackServer = serveMutation({
  mutation: clearTrack,
  handler: async (tx, args) => {
    await tx.sql`update steps set "on" = 0 where track_id = ${args.trackId} and "on" = 1`;
  }
});

export const restoreStepsServer = serveMutation({
  mutation: restoreSteps,
  handler: async (tx, args) => {
    for (const step of args.steps) {
      await tx.sql`update steps set "on" = ${step.on ? 1 : 0}, velocity = ${step.velocity}
                   where id = ${step.stepId}`;
    }
  }
});

export const renameTrackServer = serveMutation({
  mutation: renameTrack,
  handler: async (tx, args) => {
    await tx.sql`update tracks set name = ${args.name} where id = ${args.trackId}`;
  }
});

export const setGainServer = serveMutation({
  mutation: setGain,
  handler: async (tx, args) => {
    await tx.sql`update tracks set gain = ${args.gain} where id = ${args.trackId}`;
  }
});

export const setBpmServer = serveMutation({
  mutation: setBpm,
  handler: async (tx, args) => {
    await tx.sql`update transport set bpm = ${args.bpm} where id = ${TRANSPORT_ID}`;
  }
});
