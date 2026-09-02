# Annotating

Human page: [Annotating](../docs/annotating.mdx). API: [`wheel/annotate`](api/annotate.md), [`wheel/vite`](api/vite.md).

Leave a note on a running app, and — while ⏺ record is on — record what the app did. The recording is semantic, not visual: it names actions and atoms rather than DOM mutations.

## Mount

`WheelAnnotate` mounts inside a `WheelApp`. The pane is registered TWICE under the id `annotate`: the resident stub contributes a bare arm button, and the chrome replaces it on load with the real one — composer, arm/disarm, and `AnnotateService.saved` (the notes this session wrote, listed newest first; `copyHandle` puts one back on the clipboard). Pane state reads the SERVICE's mode, never "is the chrome loaded" — the chrome never unloads, so that read left the pane saying "drag a rectangle" after every save. It has no chrome of its own beyond a recording light: it CONTRIBUTES a pane to the debug dock through `registerDebugPane` (`debug/panes.ts`), and that pane is the only way in besides ⌘⇧A. The dock cannot import the annotator — the DAG runs `annotate -> debug` — so the dependency is inverted: panes register, the dock renders what is present, and a build without the annotator has neither the pane nor the code.

A page with no dock therefore cannot be annotated, which is the intent: annotation is a thing you do to a wheel app. The website's docs and landing pages mount `WheelApp` for exactly this reason. Nested `WheelApp`s (the site embeds live demos) share ONE dock — the outermost wins, via the `DockPresent` context. `wheel/annotate` is a separate entry from `wheel/debug`, so a build can ship the annotator without the debug panel.

It is split in three, measured on the tracker by building it with and without the mount. Resident: the pane registration, the chord, the loader — 2.1 KB gzipped. Deferred behind a dynamic `import()` of `annotate-system`: marquee, composer, voice, the recorder, note rendering — 13.4 KB, fetched on first arm. Deferred again: `modern-screenshot`, 10.2 KB, fetched the first time a note is drawn. The main bundle is unchanged by all of it.

`enabled` defaults to `isWheelDevMode()`. A production page records nothing and shows nothing unless the app passes `enabled`. The app owns that decision because it decides whose application state may be captured.

Service identity is declared, not preserved: every Service subclass carries `static override serviceName` (rule `require-service-name`, auto-fixable), read by `serviceDisplayName()` as an OWN property so a subclass never inherits its parent's identity. Class names may therefore be minified. `wheelDevTools()` still sets esbuild `keepNames` by default; `wheelDevTools({ keepNames: false })` opts out and saves 11.2 KB gzipped (measured on Axle), at the cost of minified function names in raw stack traces.

## Flow

`AnnotateService` holds the whole flow in `mode`: `off`, `armed` (the marquee is up), `composing`. There is ONE way in — drawing the rectangle is the interaction. There is no click-to-pick and no page note; every note is a rectangle.

- `arm()` / `disarm()`: toggle annotation mode. Arming records nothing: no tap is installed until `toggleRecording()`.
- `pickRegion(rect)`: the only door. The rectangle is VIEWPORT coordinates and is stored unchanged — a note describes a moment on screen, not a place in the document.
- `setRasterizer()` is the still's test seam, matching `setVoiceCapture` / `setVideoCapture`: jsdom has no layout and no canvas encoder, and every test about what a note CARRIES needs a note with pixels in it.
- pixels are otherwise automatic: `pickRegion` fires `rasterizeRegion()` (`rasterize.ts`), which serializes the DOM into an SVG `foreignObject` via `modern-screenshot` (dynamically imported, so it reaches the browser only when a note is written). No permission, no prompt. It returns null rather than throwing — a note without pixels is still a note. Its `filter` drops everything under `CHROME_SELECTOR`, imported from `core/chrome.ts`: a local copy of that string went stale when the attribute moved, and a filter matching nothing fails by letting everything through, which put the annotator's own outline in every screenshot. Rule `no-literal-chrome-attribute` now forbids the copy.
- the composer shows the clip in place of the still once `draft.video` exists. A still of the moment the box was drawn is the wrong thing to show beside a recording of what happened after it.
- video is NOT rasterized per frame: serializing a subtree costs tens to hundreds of ms on the main thread, so sampling it would stutter the app under observation. Motion comes from the compositor or not at all.
- the frame's handles are gated on pointer proximity (`HANDLE_REACH`, measured from a document `pointermove` because the frame is click-through) and hidden entirely while `recording` — they would otherwise be in the screen recording.
- `reshapeRegion(rect)` / `previewRegion(rect)`: move or resize the open rectangle. `previewRegion` runs per frame and moves the outline only; `reshapeRegion` runs on release and re-resolves the anchor, the components underneath and the screenshot — hit-testing the tree and rasterizing the DOM both cost real time, on the app being annotated. The words already typed are kept.
- there is no manual screenshot any more. `captureShot()` and the `region` half of `AnnotateCapture` are gone: it re-took the still from the screen for what DOM capture cannot see (canvas, video, cross-origin iframes), and ⏺ record now captures true pixels of the same rectangle. Two buttons doing the same thing is a choice nobody can make from a label. `AnnotateCapture` is one method, `stream()`.
- `toggleRecording()`: the ONE recording switch — the screen video and the event/state taps together, because they answer one question. Nothing is tapped before it. It installs the recorder, opens a clip, re-snapshots `startState` (the timeline is read against the state recording started from, not the state when the box was drawn), and then asks for the screen. The screen prompt is allowed to fail behind the recorder: `recording` stays true, `filming` does not. `save()`, `discard()` and `disarm()` all end it. `startClip()` clears the buffer, so a second recording in one session does not carry the first. `startVideo(getStream, rect)` crops: the display stream is played into an off-document `<video>` and `drawImage`d into a canvas sized to the rectangle, and `canvas.captureStream()` is what `MediaRecorder` records. Region Capture (`track.cropTo`) was not used — Chromium-only, and it crops to an ELEMENT, the only one with these bounds being the annotator's own outline, whose border would then be in every frame.
- `setText()`, `setLabel()`: edit the draft.
- `listen()` / `stopListening()`: speech capture. The words stream into `draft.text` — the note box, not a second box — appended after whatever was already typed. Recognition sends a GROWING partial, so each one is written as `voiceBase + partial`, never appended. `draft.transcript` still holds what was HEARD, so `payload.voice` records that the note was spoken even after the text is edited by hand.
- `save()` / `discard()`: send the note, or drop it. `save()` reads the clip BEFORE the taps come out and hands it to `deliver` / `buildPayload`; an uninstalled recorder has nothing left to tell them. There is no evidence gate any more — the gate existed because an always-on buffer filled notes with raw input, and an explicit recording cannot have that problem.
- `editNote(saved)`: reopen a note written this session. The draft carries `basedOn`, and `buildPayload` then returns that payload with new text and label — same id, same anchor, same timeline, same state. The composer hides the capture controls and the live timeline while rewriting, and saving REPLACES the note at the sink rather than adding one.
- `dismissNotice()`: clear the snackbar early.

Keys are named once in `annotate/shortcuts.ts` and printed on the controls they drive, so a label cannot go stale. `armChord()` arms or disarms from anywhere. While composing, `r` / `t` / `s` / `d` are record / talk / save / discard, bound by an effect that runs only in that mode and unbinds with it. `Escape` steps back one thing at a time: it ends a running recording (`stopRecording()`, a separate door from the toggle so Escape can never START one), then discards the draft, then disarms. They are plain letters, so `typingInto()` ignores them whenever an input, textarea, select or `contenteditable` has focus — otherwise typing the note would fire them.

Labels are `bug`, `question`, `idea`, `todo`, picked by the number keys `1`-`4` in that order (`labelKey()`). Letters were not available: `t`, `s` and `d` are talk, save and discard, and "todo" has no free letter left.

## Recording

`Recorder` runs only inside a clip. An earlier design kept a rolling 60-second window alive for the whole session so a note could carry the minute BEFORE the box was drawn; it was removed because every session paid for taps it would probably never use, and what it mostly caught was the act of using the tools. `HARD_CAPACITY` (20k events) is the only bound left — a recording is as long as someone left it running.

Nothing inside chrome is recorded. `CHROME_ATTRIBUTE` lives in `core/chrome.ts`, not beside the annotator, because the DOCK needs it too: the layering DAG runs `annotate -> debug -> core`, and once the composer moved into the dock every click in it — arming, picking a label, pressing save — was recorded as app input.

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
- requests to the note sink are excluded (`Recorder.ignoreUrl`, set from `attach`), or delivering a note would appear inside it;
- input inside the annotator's own chrome (`CHROME_ATTRIBUTE`) is dropped at the tap, so a timeline is never mostly the keystrokes that wrote the note;
- a timeline with no `action`, `state`, `write` or `error` event is discarded at save, along with `startState`. Writes and errors count because a note may have no local action behind it at all — a rejected, rolled-back edit moves no atom, and its whole story is two writes and a cause. On a page with no services the buffer holds only raw input, which is noise dressed as evidence. This is decided on what was RECORDED, not on what services existed at mount — services are constructed lazily, so a mount-time check gets a real app wrong.

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
- [`shortcuts.ts`](../../packages/wheel/src/annotate/shortcuts.ts)
- [`media.ts`](../../packages/wheel/src/annotate/media.ts)
- [`chrome.ts`](../../packages/wheel/src/core/chrome.ts)
- [`recorder-tap.ts`](../../packages/wheel/src/core/recorder-tap.ts)
