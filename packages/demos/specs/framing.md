# Framing — behavior spec

The layout kitchen sink at `/framing`: a VS Code-shaped shell built from
`Frame.Row`/`Frame.Column`/`Frame.Drawer`/`Frame.Dock`, plus the header controls,
the stage-width slider that triggers responsive collapse, and the live layout
inspector. There is no sync backend here — the app owns structure (open editor
panes, the dock tree) in `WorkbenchService`; framing owns geometry in
`LayoutService`, persisted to `localStorage` under `wheel.layout:frames`.

Ids are permanent: never renumber, never reuse; retire a row with
~~strikethrough~~, keep it in place.

| id | behavior | notes |
|---|---|---|
| FRAMING-01 | The workbench renders the nested split tree — sidebar, work (editor row + bottom dock), outline — with three editor panes and three dock panels | smoke |
| FRAMING-02 | A resize divider exists between siblings and only between siblings, with `role=separator`, an axis-correct `aria-orientation`, and its min/max as aria values | last child (outline) has no divider |
| FRAMING-03 | The layout inspector lists every mounted frame with kind/open/visible/size/pixels, including the frames `Frame.Dock` renders, and reports interaction idle with no diagnostics | dock splits are ordinary frames |
| FRAMING-04 | ArrowLeft/ArrowRight on a focused vertical divider resize the pair by 10px, Shift by 50px, and the track's real width follows | sidebar 240px → 250 → 240 → 290 |
| FRAMING-05 | Home and End on a focused divider clamp the track to its min and max | sidebar min 160px, max 420px |
| FRAMING-06 | ArrowUp/ArrowDown on a horizontal divider move the editor-row/dock boundary, writing pixels to the px sibling and leaving the `1fr` sibling alone | bottom-panel 190px → 180 → 190; editors stays `1fr` |
| FRAMING-07 | Enter on a focused divider collapses its frame; the header toggle brings it back | same `layout.toggle(id)` as the button |
| FRAMING-08 | Double-clicking a divider resets both adjacent tracks to their JSX defaults | `resetPair` |
| FRAMING-09 | Dragging a divider with the pointer resizes the pair, shows the in-flight draft as the interaction, and commits one pixel preference | NOT behavior()-covered: needs a raw pointer drag; covered standalone-only by `browser/framing.spec.ts` |
| FRAMING-10 | Escape (or capture loss) during a divider drag cancels it and leaves the sizes untouched | raw-mouse drag in framing-behaviors.spec.ts (uninstrumented steps); also unit-covered by `kit/layout/gesture.test.ts` |
| FRAMING-11 | The sidebar toggle collapses the region: neighbours absorb the space, the divider disappears, and reopening restores the remembered width | |
| FRAMING-12 | The bottom-panel and outline toggles open and close their regions, and each button's `aria-pressed` mirrors the frame's `open` | |
| FRAMING-13 | A hidden region is `aria-hidden` and inert, so nothing inside it is reachable | closed sidebar |
| FRAMING-14 | Narrowing the stage under 760px auto-collapses the sidebar — effective `visible` flips while the user's `open` choice does not — and widening restores it at its remembered width | driven by the stage-width slider |
| FRAMING-15 | While the sidebar is auto-hidden the sidebar toggle is disabled rather than doing nothing visible | re-enables when the stage widens |
| FRAMING-16 | The drawer opens as a labelled overlay: nothing reflows to make room for it, and it closes from the same toggle | starts closed |
| FRAMING-17 | "New pane" appends an editor pane — a list edit, so a new frame and a new inspector row appear with no layout call | |
| FRAMING-18 | A pane's × closes it, and the last remaining pane cannot be closed so the split is never empty | |
| FRAMING-19 | Each pane keeps its own draft text: typing updates that pane's line readout and no sibling's | local component state, not service state |
| FRAMING-20 | More panes than fit stay reachable — the editor row's content box scrolls sideways instead of clipping panes | |
| FRAMING-21 | Dragging a pane by its ⠿ grip past a sibling reorders it, and the demo service applies the reported id order | NOT behavior()-covered: needs a raw pointer drag; covered standalone-only by `browser/framing.spec.ts` |
| FRAMING-22 | Dropping a dock panel on another panel's edge creates a split in the demo's own JSON atom via `applyDockIntent` | NOT behavior()-covered: needs a raw pointer drag; covered standalone-only by `browser/framing.spec.ts` |
| FRAMING-23 | The top-bar chips mirror the dock's panels and toggle them in and out of the dock tree | chip off removes the panel, chip on re-adds it as the last sibling |
| FRAMING-24 | Turning a chip on while the bottom-panel region is closed also reopens the region | two owners, one gesture: tree edit + `layout.open` |
| FRAMING-25 | The workspace ☰ menu is a panel checklist: toggling an entry applies immediately and keeps the menu open | `menuitemcheckbox` with `aria-checked` |
| FRAMING-26 | "Reset workspace" restores the default three panels and closes the menu | |
| FRAMING-27 | A panel's ⋯ menu closes that panel; closing every panel leaves an empty dock that says so, and a chip brings it back | empty dock is app state |
| FRAMING-28 | Right-clicking a panel's ⋯ button opens the same actions menu its click opens | `use:contextMenu` with `anchor: 'element'` |
| FRAMING-29 | Sizes and open state survive a page load, keyed by frame id | localStorage `wheel.layout:frames` |
| FRAMING-30 | "Reset layout" forgets every persisted deviation, and the defaults stay after a reload | proves the reset itself persisted |
| FRAMING-31 | Overflowing editor panes get the framework scrollbar (thumb reflects and drives the scroll position) | added for the in-flight kit scrollbar feature |
| FRAMING-32 | Inside the scrollable editor row a divider drag resizes only the dragged pane — it grows past the fit width, the neighbor keeps its size, and the scrollbar absorbs the overflow | solo resize; the pane's preference becomes pixels |
| FRAMING-33 | "Fit widths" returns every editor pane to `1fr` — the largest widths that fit without scrolling, or each pane's minimum when even minimums overflow — and fit-LOCKS the row when everything fits | lock chrome shows only while dragging |
| FRAMING-34 | Dragging a divider in the scrollable editor row within ±3px of the container's far edge snaps to the exact fit width: the divider turns to the snap color, a lock badge appears, and the release leaves zero overflow | solo drags only |
| FRAMING-35 | Snap fires from ANY drag source: growing an earlier pane pushes the row's last pane toward the container edge, and within ±3px the lock renders on the LAST pane's trailing handle and the drag locks to the exact fit | the lock lives on the edge that snapped, not the handle being dragged |
| FRAMING-36 | A fit-locked row stays fit: children hold fractional weights, so closing or adding a pane refits the rest proportionally with zero overflow, and the lock persists (also across reload); dragging the trailing handle off the edge unlocks | locked resizes trade space instead of overflowing |
| FRAMING-37 | A non-last pane's divider drag can never open a gap at the container edge: the LAST pane never shrinks below its starting width and grows exactly enough to keep the row attached — continuously, even when a drag crosses from overflow to fit (pre-existing deliberate gaps are preserved, not closed) | trailing-handle drags still detach on purpose |
