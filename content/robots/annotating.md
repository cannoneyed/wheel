# Annotating

Human page: [Annotating](../docs/annotating.mdx). API: [`wheel/annotate`](api/annotate.md), [`wheel/vite`](api/vite.md).

Leave a note on a running app and record what the app did. The recording is semantic, not visual: it names actions and atoms rather than DOM mutations.

## Mount

`WheelAnnotate` mounts the chrome inside any Wheel provider. `wheel/annotate` is a separate entry from `wheel/debug`, so a build can ship the annotator without the debug panel.

Saving requires `wheelDevTools({ noteDir })` in the Vite config. Without it, `canSave` stays false and the save button is disabled.

## Flow

`AnnotateService` holds the whole flow in `mode`: `off`, `armed`, `region`, `composing`.

- `arm()` / `disarm()`: toggle annotation mode. Arming installs the recorder in development mode.
- `pickInstance(id)`, `pickRegion(rect)`, `pickPage()`: choose a target and open the composer.
- `setText()`, `setLabel()`, `setTranscript()`: edit the draft.
- `listen()` / `stopListening()`: speech capture.
- `startClip()` / `stopClip()`: record an interval.
- `saveRetro()`: turn the rolling buffer into a clip after the fact.
- `save()` / `discard()`: write the note, or drop it.

Labels are `bug`, `question`, `idea`, `todo`, `looks-good`.

## Recording

`Recorder` merges four taps plus two harvested streams.

Taps:

- kernel actions and atom writes, through `setWheelTap()` in `wheel/core`;
- DOM input in the capture phase, mapped to the owning component;
- `fetch`, for method, url, status, and duration;
- `popstate` and `hashchange`, for route changes.

Harvested at save time, because the app already records them:

- sync writes from the client provenance log;
- errors from the capture buffer, with source-mapped stacks.

Bounds:

- writes to one atom within 80ms coalesce into one entry with a count;
- object changes store the top-level keys that differ, not both values;
- an action is inserted before the writes it caused, because the kernel can only time it on return;
- the buffer is a rolling 60-second window until a clip pins it; the hard cap is 20000 events;
- services in the `debug` group are excluded, so the recorder never records itself.

Cost with no tap installed: one null check per action call and per atom write.

## Anchors

An anchor stores the instance id, the component name, the ancestor chain, the rectangle, and a DOM path. `resolveAnchor()` returns `exact`, `renamed`, or `orphaned`. An orphaned note keeps its rectangle, screenshot, and captured state; it is never deleted or silently re-pointed.

## Artifact

`wheelDevTools({ noteDir })` serves three endpoints:

- `GET /__wheel/note`: capability probe.
- `POST /__wheel/note`: write one note.
- `GET /__wheel/notes`: list saved notes, newest first, for pins.

Each note is one directory:

```text
<noteDir>/<epoch>-<slug>/
  note.md
  note.json
  shot.png
  clip.webm
  audio.webm
```

`note.md` is rendered from `note.json`, so the two cannot disagree. The POST response returns a `read <path>/note.md` command, which the page copies to the clipboard.

## Seams

- `setVoiceCapture()` and `setVideoCapture()` replace hardware capture in tests.
- `AnnotateService.attach()` takes the sync client and the pixel-capture seams.
- Missing permissions set `notice`, not the error buffer. A refused screen capture, microphone, or recognizer is an expected outcome, not an application fault.

Primary sources:

- [`annotate-service.ts`](../../packages/wheel/src/annotate/annotate-service.ts)
- [`recorder.ts`](../../packages/wheel/src/annotate/recorder.ts)
- [`anchor.ts`](../../packages/wheel/src/annotate/anchor.ts)
- [`note-format.ts`](../../packages/wheel/src/annotate/note-format.ts)
- [`recorder-tap.ts`](../../packages/wheel/src/core/recorder-tap.ts)
