# Kanban — behavior spec

The board demo: three static columns (To do / Doing / Done), synced cards
with tags, selection, bulk delete, a tag filter, per-card context menus, and
palette commands. Ids are permanent: never renumber, never reuse; retire a
row with ~~strikethrough~~, keep it in place.

| id | behavior | notes |
|---|---|---|
| KANBAN-01 | The board renders three columns (To do, Doing, Done) with the seeded cards | smoke |
| KANBAN-02 | Typing a title in a column's add form and pressing Enter appends the card to that column | tag input defaults to `misc` |
| KANBAN-03 | The ◀/▶ buttons on a card move it to the neighboring column's tail | |
| KANBAN-04 | Right-clicking a card opens its context menu with Delete and one Move entry per other column | |
| KANBAN-05 | Moving a card to another column keeps the page rendering and the moved card's context menu working | regression: 016 trigger bug (context-menu id supersession) |
| KANBAN-06 | The context menu's Delete removes the card | |
| KANBAN-07 | Clicking a card toggles its selection; the bulk-delete button enables and shows the count | toolbar button always mounted, disabled at zero |
| KANBAN-08 | Escape clears the selection | gated off while a dialog is open |
| KANBAN-09 | Backspace with a selection opens a confirm dialog; confirming deletes the selected cards | same flow as the toolbar button and palette command |
| KANBAN-10 | Cancelling the bulk-delete confirm keeps every card and the selection | |
| KANBAN-11 | Clicking a tag in the filter bar shows only matching cards; clear restores all | active tag click also clears |
| KANBAN-12 | The context menu's "Move to <column>" sends the card to that column | |
| KANBAN-13 | The command palette (mod+k) runs "Delete selected cards…" into the same confirm flow | |
| KANBAN-14 | Selection-gated palette commands (Clear selection, Delete selected) only appear while cards are selected | reactive `when` gates |
