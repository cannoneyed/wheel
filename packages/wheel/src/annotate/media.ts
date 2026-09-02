/**
 * Voice and video capture — the two parts that touch browser hardware.
 *
 * **Voice.** Speech recognition produces the transcript, and the transcript is
 * the deliverable: an agent cannot listen to an audio file, so a note whose
 * only content is `audio.webm` tells it nothing. The audio is kept anyway, as
 * the receipt — when a transcript mangles a technical word, the recording is
 * the ground truth to check against.
 *
 * Recognition is a browser feature that not every browser has (`webkit`-
 * prefixed in Chrome and Edge, missing in Firefox). Missing recognition
 * degrades to "audio saved, transcript empty and typeable"; a denied
 * microphone degrades to "type your note". Neither is an error, and neither is
 * logged — the error buffer exists to make real breakage unmissable, and a
 * refused permission is not breakage.
 *
 * **Video.** A clip's frames come from the SAME display-capture stream the
 * rich-screenshot tool already opened, so the browser prompts once per tab
 * session rather than once per feature — cropped, through a canvas, to the
 * rectangle the note is about. A refused prompt is not fatal either: the
 * timeline is the recording, the video is an illustration of it.
 *
 * Both capture paths are module seams (`setVoiceCapture`, `setVideoCapture`)
 * so tests, jsdom, and headless browsers inject their own.
 */

/** What a finished voice capture produced. */
export interface VoiceResult {
  /** Everything recognition finalized, joined. Empty when recognition was unavailable. */
  readonly transcript: string;
  /** `data:audio/webm;base64,…`, or null when the microphone was unavailable. */
  readonly audio: string | null;
}

/** A capture in progress. */
export interface VoiceSession {
  /** Stop capturing and resolve with what was captured. */
  stop(): Promise<VoiceResult>;
  /** Stop capturing and throw the result away. */
  cancel(): void;
}

/** How a voice session reports progress while it runs. */
export interface VoiceOptions {
  /** Called with the transcript so far (final + in-flight), for a live composer. */
  onPartial?: (text: string) => void;
}

import type { NoteRect } from './types';

/** A video capture in progress. */
export interface VideoSession {
  /** Stop recording and resolve with a `data:video/webm;base64,…`, or null if nothing was captured. */
  stop(): Promise<string | null>;
  /** Stop recording and throw the result away. */
  cancel(): void;
}

/** The structural slice of the browser's SpeechRecognition that this module uses. */
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  start(): void;
  stop(): void;
}

/** The structural slice of a recognition result event. */
interface RecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<{ readonly isFinal: boolean; readonly 0: { readonly transcript: string } }>;
}

type VoiceCapture = (options: VoiceOptions) => VoiceSession;
type VideoCapture = (rect: NoteRect) => Promise<VideoSession>;

let voiceCapture: VoiceCapture | null = null;
let videoCapture: VideoCapture | null = null;

/** @internal Test/host seam: replace the voice capture implementation (jsdom has no microphone). */
export function setVoiceCapture(capture: VoiceCapture | null): void {
  voiceCapture = capture;
}

/** @internal Test/host seam: replace the video capture implementation. */
export function setVideoCapture(capture: VideoCapture | null): void {
  videoCapture = capture;
}

/** Whether this browser can turn speech into text without a server. */
export function speechRecognitionAvailable(): boolean {
  const host = globalThis as Record<string, unknown>;
  return typeof (host['SpeechRecognition'] ?? host['webkitSpeechRecognition']) === 'function';
}

/** Construct the browser's recognizer, or null where there isn't one. */
function newRecognition(): RecognitionLike | null {
  const host = globalThis as Record<string, unknown>;
  const Ctor = (host['SpeechRecognition'] ?? host['webkitSpeechRecognition']) as
    | (new () => RecognitionLike)
    | undefined;
  return typeof Ctor === 'function' ? new Ctor() : null;
}

/** Read a Blob as a data URL, the form every attachment travels in. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('could not read captured media'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/**
 * Start listening: transcript from speech recognition, audio from the
 * microphone. Either half may be missing; the session still resolves.
 */
export function startVoice(options: VoiceOptions = {}): VoiceSession {
  if (voiceCapture) return voiceCapture(options);

  let finalText = '';
  const recognition = newRecognition();
  if (recognition) {
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]!;
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      options.onPartial?.(`${finalText}${interim}`);
    };
    // A recognizer reports `no-speech`, `aborted` and `not-allowed` as errors.
    // None of those is an application fault, so an unheard note simply comes
    // back with an empty transcript.
    recognition.onerror = null;
    try {
      recognition.start();
    } catch {
      // Already started, or unavailable. Either way: no transcript, not a fault.
    }
  }

  const chunks: Blob[] = [];
  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  const started = navigator.mediaDevices
    ?.getUserMedia({ audio: true })
    .then((granted) => {
      stream = granted;
      mediaRecorder = new MediaRecorder(granted);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      mediaRecorder.start();
    })
    .catch(() => {
      // No microphone, or permission refused. The transcript still stands and
      // the caller sees `audio: null` — an expected outcome, not an error.
    });

  const teardown = (): void => {
    try {
      recognition?.stop();
    } catch {
      // Stopping an already-stopped recognizer throws in some browsers.
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
  };

  return {
    async stop(): Promise<VoiceResult> {
      await started;
      const audio = await new Promise<string | null>((resolve) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
          teardown();
          resolve(null);
          return;
        }
        mediaRecorder.onstop = () => {
          void blobToDataUrl(new Blob(chunks, { type: 'audio/webm' }))
            .then(resolve)
            .catch(() => resolve(null));
        };
        teardown();
      });
      return { transcript: finalText.trim(), audio };
    },
    cancel(): void {
      teardown();
    }
  };
}

/**
 * The first webm codec this browser admits to supporting, or none.
 *
 * Returns undefined rather than `''` when nothing matches: `MediaRecorder`
 * treats an empty `mimeType` as a request for a container called "", not as
 * "you choose", and rejects it. Omitting the option is how you ask for the
 * default.
 */
function supportedVideoType(): string | undefined {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(candidate)) return candidate;
  }
  return undefined;
}

/** Frames per second the cropped canvas is captured at. */
const CLIP_FPS = 30;

/**
 * Play a display stream into an off-document `<video>`, ready to read frames.
 *
 * The stream is the whole tab; this is the source the crop is taken from.
 */
async function streamAsVideo(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  if (video.videoWidth === 0) {
    await new Promise<void>((ready) => video.addEventListener('loadeddata', () => ready(), { once: true }));
  }
  return video;
}

/**
 * Start recording ONE RECTANGLE of the tab.
 *
 * The browser only ever hands out a whole surface — a tab, a window, a screen —
 * so a clip of "the thing I drew a box around" has to be cropped out of it. A
 * note is about a rectangle, and a recording of the entire window is not a
 * recording of that rectangle: it buries the subject in chrome, address bar and
 * dock, and it is many times the bytes.
 *
 * The crop runs through a canvas rather than through the Region Capture API
 * (`track.cropTo`), which is Chromium-only and crops to an ELEMENT — and the
 * only element with these exact bounds is the annotator's own outline, which
 * would put its border inside every frame. `drawImage` from a video element is
 * a GPU blit: it costs the compositor, not the app being observed, which is the
 * distinction that rules DOM rasterization out as a video source.
 *
 * `getStream` comes from the caller because the rich-screenshot tool already
 * owns the cached display-capture stream — passing it in is what keeps the
 * browser to ONE permission prompt per tab session.
 */
export async function startVideo(
  getStream: () => Promise<MediaStream>,
  rect: NoteRect
): Promise<VideoSession> {
  if (videoCapture) return videoCapture(rect);
  const source = await streamAsVideo(await getStream());

  // The captured surface is the viewport at device resolution, so this is how
  // many captured pixels one CSS pixel is worth. Same assumption the rich
  // screenshot already makes about the same stream.
  const scale = source.videoWidth / (globalThis.innerWidth || source.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(rect.width * scale));
  canvas.height = Math.max(2, Math.round(rect.height * scale));
  const paint = canvas.getContext('2d');

  let frame = 0;
  const draw = (): void => {
    paint?.drawImage(
      source,
      rect.x * scale,
      rect.y * scale,
      rect.width * scale,
      rect.height * scale,
      0,
      0,
      canvas.width,
      canvas.height
    );
    frame = requestAnimationFrame(draw);
  };
  draw();

  const cropped = canvas.captureStream(CLIP_FPS);
  const chunks: Blob[] = [];
  const mimeType = supportedVideoType();
  const recorder = new MediaRecorder(cropped, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  /**
   * Stop painting and release the crop.
   *
   * The DISPLAY stream is left running on purpose: it is the tab-wide capture
   * the screenshot tool caches, and stopping it here would cost the next
   * feature a second permission prompt.
   */
  const teardown = (): void => {
    cancelAnimationFrame(frame);
    for (const track of cropped.getTracks()) track.stop();
    source.pause();
    source.srcObject = null;
  };

  return {
    stop(): Promise<string | null> {
      return new Promise((resolve) => {
        if (recorder.state === 'inactive') {
          teardown();
          resolve(null);
          return;
        }
        recorder.onstop = () => {
          teardown();
          // No frames means no video. Handing back a data URL for an empty
          // blob would attach a `clip.webm` that plays nothing, which is worse
          // than saying there is no clip.
          if (chunks.length === 0) {
            resolve(null);
            return;
          }
          void blobToDataUrl(new Blob(chunks, { type: mimeType ?? 'video/webm' }))
            .then(resolve)
            .catch(() => resolve(null));
        };
        recorder.stop();
      });
    },
    cancel(): void {
      if (recorder.state !== 'inactive') recorder.stop();
      teardown();
    }
  };
}
