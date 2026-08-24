/**
 * wheel/annotate — leave notes on a running app, and record what it did.
 *
 * Mount `<WheelAnnotate/>` anywhere inside a wheel app. A ✎ chip appears;
 * ⌘⇧A arms it. Pick a component, say what is wrong (typed or spoken), and a
 * directory lands under `.wheel/notes/` holding the note, the component's live
 * state, a screenshot, and — for a clip — a merged timeline of every action,
 * state change, input, sync write and error that happened while you recorded.
 *
 * Kept separate from `wheel/debug` on purpose: a production build can ship the
 * annotator without the debug panel, and everything here is dev-server-backed
 * rather than panel-backed.
 */
export { WheelAnnotate } from './annotate-system';
export {
  AnnotateService,
  type AnnotateCapture,
  type AnnotateMode,
  type NoteDraft,
  type SavedNote
} from './annotate-service';
export { Recorder, stateTreeSnapshot, type RecorderOptions, type RecorderStreams } from './recorder';
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
export { describeEvent, noteId, renderNoteMarkdown, slugify } from './note-format';
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
