/**
 * wheel/annotate — leave notes on a running app, and record what it did.
 *
 * Mount `<WheelAnnotate/>` anywhere inside a wheel app. It starts a rolling
 * 60-second recorder and shows a ✎ chip; ⌘⇧A arms it, and only then is the
 * rest of the UI fetched. Pick a component, say what is wrong (typed or
 * spoken), and a directory lands under `.wheel/notes/` holding the note, the
 * component's live state, a screenshot, and — for a clip — a merged timeline
 * of every action, state change, input, sync write and error recorded.
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
  type NoteDraft,
  type SavedNote
} from './annotate-service';
export { Recorder, stateTreeSnapshot, type RecorderOptions, type RecorderStreams } from './recorder';
export {
  annotateRecorder,
  startAnnotateSession,
  stopAnnotateSession,
  type AnnotateSessionOptions
} from './session';
export { downloadNote, setNoteDownload } from './download';
export {
  anchorToInstance,
  anchorToPage,
  anchorToRegion,
  describeElement,
  domPathOf,
  resolveAnchor,
  targetOf,
  targetsUnder,
  type ResolvedAnchor
} from './anchor';
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
  AnchorMatch,
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
