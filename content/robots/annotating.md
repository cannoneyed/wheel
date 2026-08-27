# Annotating

Human page: [Annotating](../docs/annotating.mdx). API: [`wheel/annotate`](api/annotate.md), [`wheel/vite`](api/vite.md).

Leave a note on a running app and record what the app did. The recording is semantic, not visual: it names actions and atoms rather than DOM mutations.

## Mount

`WheelAnnotate` mounts inside any Wheel provider. `wheel/annotate` is a separate entry from `wheel/debug`, so a build can ship the annotator without the debug panel.

It is split in two. Resident: the rolling recorder, the chip, the chord, the loader — 4.1 KB gzipped measured on the tracker. Deferred behind a dynamic `import()` of `annotate-system`: picker, composer, voice, note rendering — 9.1 KB, fetched on first arm.

`enabled` defaults to `isWheelDevMode()`. A production page records nothing and shows nothing unless the app passes `enabled`. The app owns that decision because it decides whose application state may be captured.

`startAnnotateSession()` / `stopAnnotateSession()` own the page-wide recorder; the count is refcounted so several embedded apps share one. `AnnotateService` resolves its recorder on every read, so the chrome adopts the buffer that was already running.

Service identity is declared, not preserved: every Service subclass carries `static override serviceName` (rule `require-service-name`, auto-fixable), read by `serviceDisplayName()` as an OWN property so a subclass never inherits its parent's identity. Class names may therefore be minified. `wheelDevTools()` still sets esbuild `keepNames` by default; `wheelDevTools({ keepNames: false })` opts out and saves 11.2 KB gzipped (measured on Axle), at the cost of minified function names in raw stack traces.

## Flow

`AnnotateService` holds the whole flow in `mode`: `off`, `armed` (the marquee is up), `composing`. There is no separate region mode — drawing the rectangle is the interaction.

- `arm()` / `disarm()`: toggle annotation mode. Arming installs the recorder in development mode.
- `pickRegion(rect)`: the primary door — a dragged rectangle, given in VIEWPORT coordinates and stored in DOCUMENT coordinates so the note stays pinned to the page across scrolling.
- `pickInstance(id)`, `pickElement(el)`, `pickPage()`: a click without a drag, and the whole-screen case.
- `captureShot()`: take the screenshot. Never automatic — it opens a permission prompt.
- `recordVideo()`: add screen video to a running clip. Also never automatic.
- `setText()`, `setLabel()`, `setTranscript()`: edit the draft.
- `listen()` / `stopListening()`: speech capture.
- `startClip()` / `stopClip()`: record an interval. `startClip` records the timeline only; video is `recordVideo()`.
- `saveRetro()`: turn the rolling buffer into a clip after the fact.
- `save()` / `discard()`: write the note, or drop it.
- `dismissNotice()`: clear the snackbar early.

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
- an action is placed after the input that ran it and before the writes it caused, because the kernel can only time it on return;
- a merge that would erase the change is refused, so a value that leaves and returns inside the window stays two entries;
- the buffer is a rolling 60-second window until a clip pins it; the hard cap is 20000 events;
- services in the `debug` group are excluded, so the recorder never records itself.

Cost with no tap installed: one null check per action call and per atom write.

## Anchors

An anchor stores the instance id, the component name, the ancestor chain, the rectangle, a DOM path, an element description, and a text quote. `resolveAnchor()` returns `exact`, `renamed`, or `orphaned`. An orphaned note keeps its rectangle, screenshot, and captured state; it is never deleted or silently re-pointed.

Anchor kinds: `region` (a dragged rectangle, the default), `instance` (a component, from a click), `element` (plain DOM, from a click), `page`.

All stored rectangles are DOCUMENT coordinates. `toDocumentRect()` and `toViewportRect()` convert; pins and the target outline render `position: absolute` so they scroll with the content.

`element` anchors serve pages wheel does not own — docs, landing scrolls — where nothing is in the component registry. They resolve by DOM path first, then by the text quote when the path no longer matches or its content changed. A path whose content changed is a miss, not a match. Such a page needs a `ServiceProvider` (clientless, zero services) for `WheelAnnotate` to mount at all.

## Artifact

Saving tries the dev server first and falls back to a download, so the delivery never depends on the capability probe having returned.

Notes go to a SINK, configured with `<WheelAnnotate sink={{ url, headers }}/>` and defaulting to `/__wheel/note`. The contract is two methods on one URL:

- `POST <url>` — save one note. Body `{ id, payload, markdown, png?, video?, audio? }`; media are `data:` URLs. Answer `{ ok: true, command?, location? }`. `command` is pasteable text, `location` a URL; whichever is returned is copied to the clipboard. A non-ok answer, or an unreachable sink, falls back to downloading the note as one file.
- `GET <url>` — `{ ok: true, notes: [{ id, payload }] }`, newest first, for pins. Answering at all sets `canSave`; there is no separate probe.

Any service implementing those two methods can replace the dev server — a Durable Object, an issue tracker, a bucket.

With a dev server, `wheelDevTools({ noteDir })` serves that contract:

- `GET /__wheel/note`: list saved notes, newest first (and thereby the capability probe).
- `POST /__wheel/note`: write one note.

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

Without a dev server, `renderNoteFile()` produces ONE markdown file and `downloadNote()` hands it to the browser: prose, timeline, captured state, the screenshot as an inline data URL, and the full payload as a fenced JSON block. Audio and video are omitted — megabytes of base64 that the transcript already covers. Nothing is uploaded anywhere; there is no collector endpoint.

## Seams

- `setVoiceCapture()` and `setVideoCapture()` replace hardware capture in tests.
- `setNoteDownload()` captures downloads instead of triggering them.
- `AnnotateService.attach()` takes the sync client and the pixel-capture seams.
- Missing permissions set `notice`, not the error buffer. A refused screen capture, microphone, or recognizer is an expected outcome, not an application fault.
- `notice` is the snackbar, rendered at page level rather than inside the composer: `save()` closes the composer, so a confirmation inside it was drawn and destroyed in one tick. Outcomes auto-dismiss after 4s through the context scheduler seam (never `setTimeout`); progress messages (`capturing…`) stay until they are cleared.

Primary sources:

- [`annotate-service.ts`](../../packages/wheel/src/annotate/annotate-service.ts)
- [`recorder.ts`](../../packages/wheel/src/annotate/recorder.ts)
- [`anchor.ts`](../../packages/wheel/src/annotate/anchor.ts)
- [`note-format.ts`](../../packages/wheel/src/annotate/note-format.ts)
- [`annotate-lazy.tsx`](../../packages/wheel/src/annotate/annotate-lazy.tsx)
- [`session.ts`](../../packages/wheel/src/annotate/session.ts)
- [`recorder-tap.ts`](../../packages/wheel/src/core/recorder-tap.ts)
