/**
 * THE bridge, audio half: an `AudioContext` and its node graph, wrapped by
 * wheel. Where the graph demo bridges continuous SPACE (a rAF loop over
 * position buffers), this bridges continuous TIME.
 *
 * The shape is deliberately the same one `createGraphCanvas` uses — a
 * factory that takes plain options and returns a handle:
 *
 *   createSequencerAudio({ snapshot, onStep }): SequencerAudioHandle
 *
 * Four rules this file exists to obey:
 *
 *   1. NOTHING HERE MAY EVER ENTER AN ATOM. `Atom.set` deep-freezes on every
 *      write, and a frozen AudioContext is a dead AudioContext. The handle
 *      lives in a plain private field on TransportService.
 *   2. THE PUMP READS, IT NEVER TRACKS. `snapshot()` is called ~40×/second
 *      from a timer. It runs outside any reactive scope, so it reads the
 *      current pattern without subscribing to it — the same "loop reads,
 *      never tracks" discipline as the graph demo's `frame()`.
 *   3. DATA ABOUT THE CORE GOES BACK OUT AS DATA. `onStep(index)` fires only
 *      at step boundaries — sixteen times a bar, not forty times a second —
 *      and the service mirrors it into an atom the DOM playhead renders.
 *      That mirror is what Playwright can see; the audio itself it cannot.
 *   4. TEARDOWN IS EXPLICIT. `dispose()` cancels the pump, silences every
 *      booked voice, and closes the context.
 *
 * THE AUTOPLAY RULE, because it shapes the whole API: a browser will not let
 * a page make noise until the person sitting in front of it has interacted.
 * So the AudioContext is NOT created at mount — it is created inside
 * `start()`, which only ever runs from a click or a keypress, and `start()`
 * reports back whether the context actually reached `running` so the UI can
 * say so instead of silently miming.
 *
 * NO SAMPLE FILES. All four voices are synthesized from oscillators and a
 * noise buffer, so the demo ships zero network assets and works byte-for-byte
 * the same inside the website's static `/demos` embed.
 */
import { scheduleAhead, startState, type Pattern, type ScheduledTick, type SchedulerState } from './scheduler';

/** How often the JS pump wakes up. Sloppy on purpose; the audio clock is not. */
const PUMP_MS = 25;

/**
 * How far ahead of the audio clock each pump books. Long enough that a late
 * timer (a busy main thread, a garbage collection) still finds the window
 * open; short enough that a tempo or pattern edit is audible within an eighth
 * of a second.
 */
const LOOKAHEAD_SECONDS = 0.16;

/** Master level, so four voices at once never clip the output. */
const MASTER_GAIN = 0.55;

/** Length of the pre-rendered noise buffer, in seconds. */
const NOISE_SECONDS = 2;

/** What the engine needs from the app, and nothing more. */
export interface SequencerAudioOptions {
  /**
   * The current pattern, read fresh on every pump. MUST be a non-tracking
   * read — this is called from a timer, outside any reactive scope.
   */
  readonly snapshot: () => Pattern;
  /** Fired as each step actually sounds. `-1` means "stopped, no playhead". */
  readonly onStep: (step: number) => void;
}

/** The engine handle. Lives in a plain field; never in an atom. */
export interface SequencerAudioHandle {
  /**
   * Boot (or resume) the AudioContext and start the pump. MUST be called
   * from a user gesture. Resolves `true` when the context is really running.
   */
  start(): Promise<boolean>;
  /** Stop the pump, silence anything booked, and park the playhead. */
  stop(): void;
  /** Stop and release the AudioContext. */
  dispose(): void;
}

/**
 * A tiny seeded PRNG (mulberry32) for the noise buffer.
 *
 * Why not `Math.random()`: the repo's determinism doctrine bans raw
 * randomness in `src/`, and here the ban happens to buy something real —
 * every client renders a bit-identical noise buffer, so the hats and snare
 * sound the same in every window rather than subtly different in each.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One buffer of white noise, shared by every snare and hat hit. */
function makeNoiseBuffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * NOISE_SECONDS), context.sampleRate);
  const channel = buffer.getChannelData(0);
  const random = seededRandom(0x5eed);
  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = random() * 2 - 1;
  }
  return buffer;
}

/** Everything one booked hit needs to build (and later cancel) its nodes. */
interface VoiceContext {
  readonly context: AudioContext;
  readonly destination: AudioNode;
  readonly noise: AudioBuffer;
  /** Register a source so `stop()` can cancel it before it ever sounds. */
  readonly track: (source: AudioScheduledSourceNode) => void;
}

/** An envelope that starts at `peak` and decays to silence over `seconds`. */
function decayGain(context: AudioContext, when: number, peak: number, seconds: number): GainNode {
  const gain = context.createGain();
  gain.gain.setValueAtTime(Math.max(0.0001, peak), when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
  return gain;
}

/** Kick: a sine whose pitch drops from a thump to a body in 110ms. */
function playKick(voice: VoiceContext, when: number, level: number): void {
  const osc = voice.context.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, when);
  osc.frequency.exponentialRampToValueAtTime(45, when + 0.11);
  const gain = decayGain(voice.context, when, level, 0.34);
  osc.connect(gain).connect(voice.destination);
  osc.start(when);
  osc.stop(when + 0.4);
  voice.track(osc);
}

/** Snare: a high-passed noise burst with a short tuned body under it. */
function playSnare(voice: VoiceContext, when: number, level: number): void {
  const noise = voice.context.createBufferSource();
  noise.buffer = voice.noise;
  const filter = voice.context.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1200;
  const noiseGain = decayGain(voice.context, when, level * 0.7, 0.17);
  noise.connect(filter).connect(noiseGain).connect(voice.destination);
  noise.start(when);
  noise.stop(when + 0.25);
  voice.track(noise);

  const body = voice.context.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(185, when);
  const bodyGain = decayGain(voice.context, when, level * 0.35, 0.1);
  body.connect(bodyGain).connect(voice.destination);
  body.start(when);
  body.stop(when + 0.15);
  voice.track(body);
}

/** Hat: the same noise, filtered much higher and cut off almost at once. */
function playHat(voice: VoiceContext, when: number, level: number): void {
  const noise = voice.context.createBufferSource();
  noise.buffer = voice.noise;
  const filter = voice.context.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  const gain = decayGain(voice.context, when, level * 0.4, 0.045);
  noise.connect(filter).connect(gain).connect(voice.destination);
  noise.start(when);
  noise.stop(when + 0.08);
  voice.track(noise);
}

/** Clave: two short sines an octave apart — the classic wood-block click. */
function playClave(voice: VoiceContext, when: number, level: number): void {
  for (const [frequency, share] of [
    [1180, 1],
    [2360, 0.4]
  ] as const) {
    const osc = voice.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, when);
    const gain = decayGain(voice.context, when, level * 0.5 * share, 0.055);
    osc.connect(gain).connect(voice.destination);
    osc.start(when);
    osc.stop(when + 0.1);
    voice.track(osc);
  }
}

/** Voice name → the function that builds its nodes. Unknown names are silent. */
const VOICES: Record<string, (voice: VoiceContext, when: number, level: number) => void> = {
  kick: playKick,
  snare: playSnare,
  hat: playHat,
  clave: playClave
};

/** The constructor, including the prefixed one older Safari still ships. */
function audioContextCtor(): (new () => AudioContext) | null {
  const scope = globalThis as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/**
 * Build the audio engine. Nothing is created until `start()` — constructing
 * an AudioContext at mount time is what trips the autoplay policy.
 */
export function createSequencerAudio(options: SequencerAudioOptions): SequencerAudioHandle {
  // ---- plain fields: none of this may go near an atom ----------------------
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let state: SchedulerState = startState(0);
  /** Steps booked on the audio clock but not yet reached — the UI's queue. */
  let pending: ScheduledTick[] = [];
  /** Every source booked but not yet finished, so stop() can cancel them. */
  let booked: AudioScheduledSourceNode[] = [];
  let lastStep = -1;

  const emitStep = (step: number): void => {
    if (step !== lastStep) {
      lastStep = step;
      options.onStep(step);
    }
  };

  const silence = (): void => {
    for (const source of booked) {
      try {
        source.stop();
      } catch {
        // Already finished: stopping a spent source throws, and that is fine.
      }
    }
    booked = [];
    pending = [];
  };

  /**
   * One turn of the pump: advance the DOM playhead to wherever the audio
   * clock has actually got to, then book whatever the next window needs.
   */
  const pump = (): void => {
    if (!context || !master || !noise) {
      return;
    }
    const now = context.currentTime;

    // 1. data OUT: the playhead, at step boundaries only.
    let reached = -1;
    while (pending.length > 0 && pending[0]!.timeSeconds <= now) {
      reached = pending.shift()!.step;
    }
    if (reached >= 0) {
      emitStep(reached);
    }

    // 2. the pure part: what should sound in the next LOOKAHEAD_SECONDS?
    const result = scheduleAhead(state, options.snapshot(), now, LOOKAHEAD_SECONDS);
    state = result.state;

    // 3. data IN → nodes. The only imperative step, and it is a straight
    //    transcription of the pure result.
    const voice: VoiceContext = {
      context,
      destination: master,
      noise,
      track: (source) => {
        booked.push(source);
        source.onended = () => {
          booked = booked.filter((entry) => entry !== source);
        };
      }
    };
    for (const hit of result.hits) {
      VOICES[hit.voice]?.(voice, hit.timeSeconds, hit.level);
    }
    pending.push(...result.ticks);
  };

  const stop = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    silence();
    emitStep(-1);
  };

  return {
    async start(): Promise<boolean> {
      const Ctor = audioContextCtor();
      if (!Ctor) {
        return false; // no WebAudio here; the UI says so rather than pretending
      }
      context ??= new Ctor();
      master ??= (() => {
        const gain = context!.createGain();
        gain.gain.value = MASTER_GAIN;
        gain.connect(context!.destination);
        return gain;
      })();
      noise ??= makeNoiseBuffer(context);
      if (context.state === 'suspended') {
        // Only succeeds inside a user gesture — that IS the autoplay policy.
        await context.resume();
      }
      if (timer !== null) {
        return context.state === 'running';
      }
      // A small head start so the first pump books into the future rather
      // than racing the clock it just read.
      state = startState(context.currentTime + 0.08);
      pending = [];
      lastStep = -1;
      pump();
      // eslint-disable-next-line wheel/no-raw-timers -- The WebAudio clock has no callback: something on the JS side must wake up and book the next window, and rAF is wrong here because browsers throttle it to a crawl (or stop it entirely) in a background tab — which for a metronome means the audio dies while the tab is hidden. A plain interval keeps running. Its jitter is exactly what the lookahead window absorbs; see the module doc.
      timer = setInterval(pump, PUMP_MS);
      return context.state === 'running';
    },
    stop,
    dispose(): void {
      stop();
      const closing = context;
      context = null;
      master = null;
      noise = null;
      void closing?.close().catch(() => {
        // A context closed twice (double teardown) rejects; nothing to do.
      });
    }
  };
}
