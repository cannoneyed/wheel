# Todos — behavior spec

The local-first baseline demo: one synced todo list with an add input, a
per-row checkbox and delete button, a derived "N remaining" count, a
clear-completed flow behind a confirm dialog, per-row context menus, and two
shortcuts (`n` focuses the add input, `mod+backspace` clears completed). Ids
are permanent: never renumber, never reuse; retire a row with
~~strikethrough~~, keep it in place.

| id | behavior | notes |
|---|---|---|
| TODOS-01 | The page renders the add input (placeholder `Add a todo… (press n)`), the add button, the "N remaining" count and the synced rows | smoke |
| TODOS-02 | Typing text in the add input and pressing Enter appends a todo and clears the input | |
| TODOS-03 | The `+` (Add todo) button submits the draft — the same path as Enter | |
| TODOS-04 | A blank or whitespace-only draft adds nothing and leaves the draft in place | `submit()` returns early before trimming into a mutation |
| TODOS-05 | The row checkbox toggles done: the box checks and the text strikes through; toggling again restores it | |
| TODOS-06 | "N remaining" counts only open todos — it rises on add, falls when a todo is checked, and ignores deleting a done todo | derived computed, never stored |
| TODOS-07 | The row's trash button deletes that todo | |
| TODOS-08 | Right-clicking a row opens its context menu with a toggle entry and Delete todo | |
| TODOS-09 | A done row's menu entry reads "Mark as not done" | menu label reflects live row state |
| TODOS-10 | The menu's toggle entry marks the todo done and closes the menu | |
| TODOS-11 | The menu's Delete todo removes the row and closes the menu | |
| TODOS-12 | Escape closes the row menu and mutates nothing | |
| TODOS-13 | "Clear completed (N)" is hidden while nothing is done and appears with the count once a todo is checked | `Show when={completedCount > 0}` |
| TODOS-14 | Clear completed opens a confirm naming the count; confirming deletes every done todo and keeps the open ones | one `todos.deleteMany` mutation, one undo step |
| TODOS-15 | Cancelling the clear-completed confirm keeps every todo, still done, button still shown | |
| TODOS-16 | `mod+backspace` runs the same confirm-then-clear flow as the button | one service member, two entry points |
| TODOS-17 | `mod+backspace` does nothing while no todo is done — no dialog opens | binding's `when` gate |
| TODOS-18 | `n` focuses the add input without typing the letter | `preventDefault()` runs before the handler |
| TODOS-19 | `n` typed while the add input is focused inserts the character instead of firing the shortcut | bindings skip editable targets (`inInputs` defaults to false) |
| TODOS-20 | While the confirm dialog is open, shortcuts are gated: a second `mod+backspace` stacks no dialog, `n` does not steal focus, Escape dismisses without clearing | overlay owns focus |
| TODOS-21 | A row renders optimistically on add while the sync badge shows the in-flight chip, which then settles and leaves the badge connected | local-first: the UI never waits for the server |
| TODOS-22 | With `?sync=local` the demo boots the in-browser WASM engine, reports connected and round-trips an add with no sync server | mirrors in-browser-sync.spec.ts, now dual-host |
