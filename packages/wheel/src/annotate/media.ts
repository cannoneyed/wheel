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
 * session rather than once per feature. A refused prompt is not fatal either:
 * the timeline is the recording, the video is an illustration of it.
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
type VideoCapture = () => Promise<VideoSession>;

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

/** The first webm codec this browser admits to supporting, or the empty default. */
function supportedVideoType(): string {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(candidate)) return candidate;
  }
  return '';
}

/**
 * Start recording the tab's pixels for a clip.
 *
 * `getStream` comes from the caller because the rich-screenshot tool already
 * owns the cached display-capture stream — passing it in is what keeps the
 * browser to ONE permission prompt per tab session.
 */
export async function startVideo(getStream: () => Promise<MediaStream>): Promise<VideoSession> {
  if (videoCapture) return videoCapture();
  const stream = await getStream();
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType: supportedVideoType() });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();
  return {
    stop(): Promise<string | null> {
      return new Promise((resolve) => {
        if (recorder.state === 'inactive') {
          resolve(null);
          return;
        }
        recorder.onstop = () => {
          void blobToDataUrl(new Blob(chunks, { type: 'video/webm' }))
            .then(resolve)
            .catch(() => resolve(null));
        };
        recorder.stop();
      });
    },
    cancel(): void {
      if (recorder.state !== 'inactive') recorder.stop();
    }
  };
}
