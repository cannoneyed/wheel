/**
 * The playhead: purely LOCAL state, and the home of the audio engine handle.
 *
 * WHY PLAY/STOP IS NOT SYNCED, since it is the first thing a reader asks. A
 * browser refuses to make sound until the person in front of it has clicked
 * something, so a synced "playing" flag could never actually start audio in
 * the other window — it would light a button that lies. Beyond the mechanics,
 * two people editing one pattern while each hears their own loop is what a
 * shared sequencer should do: the PATTERN is the document, the PLAYHEAD is
 * how you happen to be listening to it. Peers still see each other's
 * transport state — it rides the presence channel, where per-browser
 * ephemera belongs.
 *
 * The freeze rule, concretely: `Atom.set` deep-freezes every write, so the
 * AudioContext lives in `this.field()` while the two
 * facts a human or a test needs (playing, current step) live in atoms and are
 * rendered as real DOM.
 */
import { Service, type ServiceContext } from 'wheel/core';
import { KeyboardService } from 'wheel/kit';

import { createSequencerAudio, type SequencerAudioHandle } from '../audio/engine';
import { SequencerService } from './sequencer-service';

/** Owns the local playhead and the AudioContext behind it. */
export class TransportService extends Service {
  constructor(context: ServiceContext) {
    super(context);
    const keyboardService = this.service(KeyboardService);
    this.addCleanup(
      keyboardService.register({ id: 'sequencer.playPause', key: 'space', run: () => void this.toggle() })
    );
    // Explicit teardown: the AudioContext outlives the component that started
    // it, so leaving the demo must both silence it AND retract the "playing"
    // presence — otherwise peers keep counting a window that walked away.
    this.addCleanup(() => {
      this.audio.get()?.dispose();
      this.audio.set(null);
      this.sequencerService.publishPlaying(false);
    });
  }

  private readonly sequencerService = this.service(SequencerService);

  private readonly playingAtom = this.atom(false, 'playing');
  private readonly stepAtom = this.atom(-1, 'step');
  private readonly audioBlockedAtom = this.atom(false, 'audioBlocked');

  // A field tracks the AudioContext without freezing it or making it reactive.
  private readonly audio = this.field<SequencerAudioHandle | null>(null);

  /** Whether this browser's playhead is running. Local, never synced. */
  readonly playing = this.computed((): boolean => this.playingAtom.get(), 'playing');

  /**
   * The step the audio clock is currently on, or -1 when stopped. Mirrored
   * from the engine's `onStep` callback — which fires at step boundaries,
   * sixteen times a bar, NOT once per audio frame. This is the data mirror
   * the DOM playhead renders and Playwright asserts on.
   */
  readonly step = this.computed((): number => this.stepAtom.get(), 'step');

  /**
   * True when the browser refused to give us a running AudioContext (no
   * WebAudio, or the autoplay policy is still holding it suspended). The UI
   * says so rather than miming — a silent play button is a bug report.
   */
  readonly audioBlocked = this.computed((): boolean => this.audioBlockedAtom.get(), 'audioBlocked');

  /** Mirror the engine's step boundary into the atom the grid renders. */
  private readonly setStep = this.action((step: number) => {
    this.stepAtom.set(step);
  }, 'setStep');

  /**
   * Start the playhead. MUST be reached from a user gesture (a click or a
   * keypress) — that is the whole autoplay story, and it is why the
   * AudioContext is built here rather than at mount.
   */
  readonly play = async (): Promise<void> => {
    let audio = this.audio.get();
    if (!audio) {
      audio = createSequencerAudio({
        // Non-tracking on purpose: the pump calls this from a timer, outside
        // any reactive scope, so it reads the pattern without subscribing.
        snapshot: () => this.sequencerService.pattern(),
        onStep: (step) => this.setStep(step)
      });
      this.audio.set(audio);
    }
    this.playingAtom.set(true);
    this.sequencerService.publishPlaying(true);
    const running = await audio.start();
    this.audioBlockedAtom.set(!running);
  };

  /** Stop the playhead and park the highlight. The pattern is untouched. */
  readonly stop = this.action(() => {
    this.audio.get()?.stop();
    this.playingAtom.set(false);
    this.stepAtom.set(-1);
    this.sequencerService.publishPlaying(false);
  }, 'stop');

  /** Space bar / the transport button: play if stopped, stop if playing. */
  readonly toggle = async (): Promise<void> => {
    if (this.playingAtom.get()) {
      this.stop();
      return;
    }
    await this.play();
  };
}
