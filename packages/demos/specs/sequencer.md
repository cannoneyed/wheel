# Sequencer — behavior spec

The bridge-to-imperative-TIME demo: a sixteen-step drum machine on the WebAudio
clock, wrapped by wheel. (The graph demo is its sibling in SPACE.) The pattern —
lanes, cells, velocities, names, tempo — is synced rows. The playhead is not:
a browser will not make sound until the person in front of it interacts, so
play/stop is per-client and two windows keep independent playheads over one
shared pattern.

Three testing notes, because a headless browser cannot hear anything:

- **The audio itself is NOT asserted here, and cannot be.** Playwright has no
  ears, and a headless Chromium renders to a null device. The timing claims —
  tempo, wrapping, live tempo edits, catch-up after a stall — are proven
  instead by `audio/scheduler.test.ts`, which runs the scheduler as a pure
  function of `(state, pattern, audioNow, lookahead)` with no AudioContext at
  all. That file is where "does it play in time" is answered; this file
  answers "does the app do the right thing".
- **The playhead has a DOM mirror.** The engine reports each step boundary to
  `TransportService`, which puts the index in an atom; the grid renders it as
  `data-step` on the container and `data-current` on the lit column. A test
  watching `data-step` change is watching the real audio clock advance.
- **Every cell is a real button** with `data-on`, `data-velocity` and a stable
  `data-testid` — there is no canvas here, because the imperative core of this
  demo is the audio, not the pixels.

Ids are permanent: never renumber, never reuse; retire a row with
~~strikethrough~~, keep it in place.

| id | behavior | notes |
|---|---|---|
| SEQ-01 | The page renders the seeded pattern — four lanes, 64 cells, a lit kick on step 1, connected sync, tempo 120 | smoke |
| SEQ-02 | Clicking a dark cell lights it and raises the "steps on" count; clicking it again puts it back | one click, one mutation |
| SEQ-03 | Shift-clicking cycles a cell's velocity through ghost → normal → accent, and a shift-click on a dark cell lights it quietly | `on` rides in the velocity mutation's args, so it stays ONE undo step |
| SEQ-04 | Clearing a lane turns off every cell in it, and ONE undo restores all of them at once | bulk inverse, same shape as the graph demo's cascade delete |
| SEQ-05 | Changing the tempo commits one mutation, survives the confirm, and undo puts the old tempo back | the field holds a draft; Enter/blur commits it |
| SEQ-06 | Pressing play advances the DOM playhead within a bar's worth of time at 120bpm, and the step index keeps changing | the audio clock, seen through its data mirror |
| SEQ-07 | Pressing stop parks the playhead at -1 and it stays there | |
| SEQ-08 | Renaming a lane updates its name in the mixer and its label on the grid | |
| SEQ-09 | The undo and redo buttons are disabled with empty history and enable as the stacks fill | buttons never unmount, they only disable |
| SEQ-10 | With two windows open, a cell touched in one shows a peer ring in the other, and an edit in one appears in the other | presence + sync, across clients |
| SEQ-11 | Play in one window does NOT start the other window's playhead, but the other window counts it as a playing peer | the local-transport decision, made visible |
