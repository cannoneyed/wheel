/**
 * wheel/annotate — leave notes on a running app, and record what it did.
 *
 * Mount `<WheelAnnotate/>` anywhere inside a wheel app. It starts a rolling
 * 60-second recorder and shows a ✎ chip; ⌘⇧A arms it, and only then is the
 * rest of the UI fetched. Drag a rectangle around what is wrong, say what is
 * wrong with it (typed or spoken), and the note is sent holding everything
 * that was under the box: the components with their live state, the plain DOM,
 * a merged timeline of every action, state change, input, sync write and
 * error, and — if you switched it on — a screen recording.
 *
 * With no dev server the note becomes a single downloaded markdown file
 * instead, so a deployed app can be annotated without sending anyone's
 * application state anywhere.
 *
 * Kept separate from `wheel/debug` on purpose: a production build can ship the
 * annotator without the debug panel.
 */
export { WheelAnnotate, type WheelAnnotateProps } from './annotate-lazy';
export {
  AnnotateService,
  type AnnotateCapture,
  type AnnotateMode,
  type NoteDraft
} from './annotate-service';
export { Recorder, stateTreeSnapshot, type RecorderOptions, type RecorderStreams } from './recorder';
export { downloadNote, setNoteDownload } from './download';
export { setRasterizer } from './rasterize';
export { anchorToRegion, describeElement, domPathOf, targetOf, targetsUnder } from './anchor';
export { describeEvent, noteId, renderNoteFile, renderNoteMarkdown, slugify } from './note-format';
export {
  setVideoCapture,
  setVoiceCapture,
  speechRecognitionAvailable,
  startVideo,
  startVoice,
  type VideoSession,
  type VoiceOptions,
  type VoiceResult,
  type VoiceSession
} from './media';
export type {
  AnnotateSink,
  NoteAnchor,
  NoteEnvironment,
  NoteLabel,
  NotePayload,
  NoteRect,
  NoteTarget,
  NoteVoice,
  RecordedAction,
  RecordedError,
  RecordedEvent,
  RecordedInput,
  RecordedNetwork,
  RecordedRoute,
  RecordedState,
  RecordedWrite
} from './types';
