# Annotating

Human page: [Annotating](../docs/annotating.mdx). API: [`wheel/annotate`](api/annotate.md), [`wheel/vite`](api/vite.md).

Leave a note on a running app and record what the app did. The recording is semantic, not visual: it names actions and atoms rather than DOM mutations.

## Mount

`WheelAnnotate` mounts inside any Wheel provider. `wheel/annotate` is a separate entry from `wheel/debug`, so a build can ship the annotator without the debug panel.

It is split in three, measured on the tracker. Resident: the rolling recorder, the chip, the chord, the loader — 4.1 KB gzipped. Deferred behind a dynamic `import()` of `annotate-system`: marquee, composer, voice, note rendering — 8.7 KB, fetched on first arm. Deferred again: `modern-screenshot`, 10.5 KB, fetched the first time a note is drawn. The main bundle is unchanged by all of it.

`enabled` defaults to `isWheelDevMode()`. A production page records nothing and shows nothing unless the app passes `enabled`. The app owns that decision because it decides whose application state may be captured.

`startAnnotateSession()` / `stopAnnotateSession()` own the page-wide recorder; the count is refcounted so several embedded apps share one. `AnnotateService` resolves its recorder on every read, so the chrome adopts the buffer that was already running.

Service identity is declared, not preserved: every Service subclass carries `static override serviceName` (rule `require-service-name`, auto-fixable), read by `serviceDisplayName()` as an OWN property so a subclass never inherits its parent's identity. Class names may therefore be minified. `wheelDevTools()` still sets esbuild `keepNames` by default; `wheelDevTools({ keepNames: false })` opts out and saves 11.2 KB gzipped (measured on Axle), at the cost of minified function names in raw stack traces.

## Flow

`AnnotateService` holds the whole flow in `mode`: `off`, `armed` (the marquee is up), `composing`. There is ONE way in — drawing the rectangle is the interaction. There is no click-to-pick, no page note, no separate clip mode and no retro door; every note is a rectangle and every note carries the rolling timeline.

- `arm()` / `disarm()`: toggle annotation mode. Arming installs the recorder (idempotent; the page-wide session normally installed it at mount).
- `pickRegion(rect)`: the only door. The rectangle is VIEWPORT coordinates and is stored unchanged — a note describes a moment on screen, not a place in the document.
- `captureShot()`: RE-take the picture from the screen via `getDisplayMedia`. Never automatic — it opens a share prompt. The escape hatch for what DOM capture cannot see: canvas, video, cross-origin iframes.
- pixels are otherwise automatic: `pickRegion` fires `rasterizeRegion()` (`rasterize.ts`), which serializes the DOM into an SVG `foreignObject` via `modern-screenshot` (dynamically imported, so it reaches the browser only when a note is written). No permission, no prompt. It returns null rather than throwing — a note without pixels is still a note.
- video is NOT rasterized per frame: serializing a subtree costs tens to hundreds of ms on the main thread, so sampling it would stutter the app under observation. Motion comes from the compositor or not at all.
- `toggleVideo()`: switch screen recording on or off for the open draft. Never automatic. Leaving it on is expected; `save()` stops it and attaches the result.
- `setText()`, `setLabel()`, `setTranscript()`: edit the draft.
- `listen()` / `stopListening()`: speech capture.
- `save()` / `discard()`: send the note, or drop it.
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

- sync writes from the client provenance log. `RecordedWrite` carries `collection` (0.2's name for a table) and a `cause` of `<kind>:<mutations joined by +>` — an atomic group commits several mutations under one cause, and the NAMES are the useful half;
- errors from the capture buffer, with source-mapped stacks.

Bounds:

- writes to one atom within 80ms coalesce into one entry with a count;
- object changes store the top-level keys that differ, not both values;
- an action is placed after the input that ran it and before the writes it caused, because the kernel can only time it on return;
- a merge that would erase the change is refused, so a value that leaves and returns inside the window stays two entries;
- the buffer is a rolling 60-second window; the hard cap is 20000 events;
- services in the `debug` group are excluded, so the recorder never records itself;
- input inside the annotator's own chrome (`CHROME_ATTRIBUTE`) is dropped at the tap, so a timeline is never mostly the keystrokes that wrote the note;
- a timeline with no `action` and no `state` event is discarded at save, along with `startState`. On a page with no services the buffer holds only raw input, which is noise dressed as evidence. This is decided on what was RECORDED, not on what services existed at mount — services are constructed lazily, so a mount-time check gets a real app wrong.

Cost with no tap installed: one null check per action call and per atom write.

## Anchors

One shape, one constructor: `anchorToRegion(registry, rect)`. It stores the rectangle plus BOTH descriptions of what was under it — the component half (`instanceId`, `name`, `ancestors`) and the DOM half (`domPath`, `element`, `text`). Either may be empty; both are recorded when they exist, because the reader takes whichever the page had. Nothing re-finds an anchor later, so there are no match tiers.

Rectangles are VIEWPORT coordinates, stored exactly as the pointer reported them. No scroll offset is added, nothing is pinned to the document, and the target outline renders `position: fixed`.

The DOM half comes from a hit-test at the rectangle's centre. It SKIPS the annotator's own overlays via `CHROME_ATTRIBUTE` (`data-wheel-annotate-chrome`), which the chrome stamps on every surface it draws — without that, the marquee's full-page shield is what every hit-test finds, and the note describes the annotator instead of the app.

`CHROME_ATTRIBUTE` has three consumers, all of them "look past the annotator": the anchor hit-test, the recorder's input tap, and the screenshot's node filter.

Pages wheel does not own — docs, landing scrolls — have no component to name, so the DOM half is all they carry. Such a page needs a `ServiceProvider` (clientless, zero services) for `WheelAnnotate` to mount at all.

## Artifact

Saving tries the dev server first and falls back to a download, so the delivery never depends on the capability probe having returned.

Every note carries the rolling window as its timeline: `buildPayload` harvests from the oldest buffered event to the save, so `startedAt` predates the moment the box was drawn. `startState` is the state tree at that moment. Both are always present.

Notes go to a SINK, configured with `<WheelAnnotate sink={{ url, headers }}/>` and defaulting to `/__wheel/note`. The contract is two methods on one URL:

- `POST <url>` — save one note. Body `{ id, payload, markdown, png?, video?, audio? }`; media are `data:` URLs. Answer `{ ok: true, command?, location? }`. `command` is pasteable text, `location` a URL; whichever is returned is copied to the clipboard. A non-ok answer, or an unreachable sink, falls back to downloading the note as one file.
- `GET <url>` — `{ ok: true, notes: [{ id, payload }] }`, newest first. Nothing on the page consumes the list; answering at all sets `canSave`, which decides only whether the button says "save note" or "download note".

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
- `AnnotateService.attach()` takes the sync client, the pixel-capture seams, and the sink.
- Missing permissions set `notice`, not the error buffer. A refused screen capture, microphone, or recognizer is an expected outcome, not an application fault.
- `notice` is the snackbar, rendered at page level rather than inside the composer: `save()` closes the composer, so a confirmation inside it was drawn and destroyed in one tick. Outcomes auto-dismiss after 4s through the context scheduler seam (never `setTimeout`); progress messages (`capturing…`) stay until they are cleared. It belongs to the annotate chrome, not to a provider an app supplies — it is in the lazy chunk and unmounts with it.

Primary sources:

- [`annotate-service.ts`](../../packages/wheel/src/annotate/annotate-service.ts)
- [`recorder.ts`](../../packages/wheel/src/annotate/recorder.ts)
- [`anchor.ts`](../../packages/wheel/src/annotate/anchor.ts)
- [`note-format.ts`](../../packages/wheel/src/annotate/note-format.ts)
- [`annotate-lazy.tsx`](../../packages/wheel/src/annotate/annotate-lazy.tsx)
- [`session.ts`](../../packages/wheel/src/annotate/session.ts)
- [`recorder-tap.ts`](../../packages/wheel/src/core/recorder-tap.ts)
