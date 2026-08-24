# Graph — behavior spec

The bridge-to-imperative-rendering demo: a force-directed package graph drawn
by three.js on a WebGL canvas, wrapped by wheel. Nodes and edges are synced
rows; live positions are derived per client from a seeded simulation and never
sync. Dragging a node rides the presence channel and commits exactly ONE
`nodes.pin` mutation on release.

Two testing notes, because a canvas has no DOM:

- The **sidebar is the mirror**: node count, edge count, selection details,
  pin state, peer count, and a button for every mutation the pointer can
  trigger — each calling the same service action the canvas calls.
- The **label overlay is the ruler**: node labels are real DOM spans the
  renderer positions each frame, so a test can read a node's on-screen box and
  click or drag the canvas at the right place. `data-settled="true"` (mirrored
  from the simulation's cooling factor) is the signal that nodes have stopped
  moving and their boxes are stable.

Ids are permanent: never renumber, never reuse; retire a row with
~~strikethrough~~, keep it in place.

| id | behavior | notes |
|---|---|---|
| GRAPH-01 | The page renders the seeded graph — 40 nodes and 54 edges in the counts, a node button per package, the WebGL stage, connected sync — and the simulation cools to `settled` | smoke |
| GRAPH-02 | Clicking a package in the sidebar list selects it: the panel shows its label, its group and `unpinned` | selection is an atom, not canvas state |
| GRAPH-03 | Clicking the canvas on top of a node selects THAT node; clicking empty canvas clears the selection | the pointer path calls `selectAt(worldX, worldY)` — the same action a test can call |
| GRAPH-04 | Adding a package appends it to the graph, selects it, and raises the node count | `nodeId` is args-borne so the add can invert |
| GRAPH-05 | Renaming the selected node updates the panel, the sidebar list and the label drawn on the canvas | the canvas label overlay is real DOM |
| GRAPH-06 | Deleting a node also deletes every edge touching it — one mutation, node count and edge count both fall | the cascade, id rule 1: zero ids minted on every branch |
| GRAPH-07 | Connect adds an edge between the selection and the chosen package; connecting the same pair again adds nothing | duplicate guard runs before the mutation |
| GRAPH-08 | Removing an edge from the selection's edge list drops just that edge | |
| GRAPH-09 | "Pin here" pins the selected node at its current simulated position — the pin state reads `pinned` | same `pin(id, x, y)` action a drag commits |
| GRAPH-10 | "Release pin" hands the node back to the simulation: the pin state reads `unpinned` and the layout reheats to `simulating` | |
| GRAPH-11 | Undo after a delete restores the node AND every edge the delete cascaded, in one step | inverse is `nodes.restore`, carrying node + edges |
| GRAPH-12 | Undo after a pin returns the node to unpinned, and redo pins it again | |
| GRAPH-13 | The undo and redo buttons are disabled with empty history and enable as the stacks fill | buttons never unmount, they only disable |
| GRAPH-14 | Dragging a node across the canvas and releasing commits exactly ONE pin mutation, which a single undo reverses | every intermediate position rode presence and wrote nothing |
| GRAPH-15 | With two windows open, one window's pointer over the stage shows up as a peer in the other, and a node added in one appears in the other | presence + sync, across clients |
