# Editor — behavior spec

The block-document demo: ONE tiptap editor whose top-level nodes are synced
wheel rows. Typing commits on a ~800ms pause (or on leaving the block);
structure gestures (Enter, Backspace, markdown prefixes, the `/` menu, the
block context menu) are mutations the moment they happen; undo/redo runs
through wheel, not through the editor's own history. Ids are permanent: never
renumber, never reuse; retire a row with ~~strikethrough~~, keep it in place.

The seeded document (`EDITOR_SCHEMA.seed` in `packages/chalk/src/editor/sync/editor.server.ts`)
is seven blocks: h1, paragraph, two bullets, a to-do, a quote, a code block.
The standalone engine is reset before each behavior, so the seed is the fixed
starting point in both hosts.

| id | behavior | notes |
|---|---|---|
| EDITOR-01 | `/editor` renders the seeded document — h1, paragraph, two bullets, a to-do with a checkbox, a quote, a code block — with every top-level node carrying its row id in `data-block-id` | smoke |
| EDITOR-02 | Inline markdown in a row's `text` renders as marks: `**tiptap**` bold, `*projection*` italic, `` `cmd+z` `` code; a code block's text stays literal | the kind is a column, never a `#` prefix in text |
| EDITOR-03 | With one client connected the document shows no peer chrome — no presence dots, carets or typing previews | the client never renders ITSELF as a peer |
| EDITOR-04 | Typing in a block shows the text at once and commits it after the ~800ms pause as one undoable mutation | commit is observable as Undo becoming available |
| EDITOR-05 | Moving the caret out of a block commits it: two blocks typed in turn undo separately, newest first | the "blur" half of pause+blur |
| EDITOR-06 | mod+z straight after typing — before the pause fires — still undoes the typing | D1: undo flushes the uncommitted keystrokes into a mutation first |
| EDITOR-07 | mod+shift+z redoes the undone edit; Redo stays disabled until there is something to redo | |
| EDITOR-08 | The toolbar Undo/Redo buttons start disabled on a fresh load and drive the same history as the shortcuts | buttons never unmount; clicking must not steal editor focus |
| EDITOR-09 | Enter mid-block splits it: the block keeps the text before the caret, a new paragraph after it takes the rest, and the caret lands in the new block | one mutation writes both rows (D2) |
| EDITOR-10 | Enter in a bullet creates another bullet — list kinds continue, prose resets to paragraph | |
| EDITOR-11 | Enter in an EMPTY bullet turns it back into a paragraph instead of stacking empty list items | |
| EDITOR-12 | Backspace at a paragraph's start merges it into the block above: the texts join and the block disappears | split's exact inverse |
| EDITOR-13 | Backspace at the start of a styled block demotes it to a paragraph instead of merging (h1 → paragraph) | |
| EDITOR-14 | Backspace at the very start of the document leaves the document unchanged | first block: nowhere to merge |
| EDITOR-15 | Undo of a split rejoins the two blocks in one step | structure gestures are single undo steps |
| EDITOR-16 | `# `, `## `, `### ` at a block's start turn it into h1/h2/h3 and the typed prefix disappears | the space that fires the rule is swallowed too |
| EDITOR-17 | `- ` and `* ` make a bullet, `1. ` a numbered item, `[] ` an unchecked to-do, `> ` a quote | |
| EDITOR-18 | ` ``` ` makes a code block, and inside it Enter inserts a literal newline instead of splitting the block | |
| EDITOR-19 | Enter on a code block's trailing blank line drops the blank line and exits to a fresh paragraph after it | |
| EDITOR-20 | `--- ` makes a divider and parks the caret in a fresh paragraph after it | an atom can't hold the caret |
| EDITOR-21 | Markdown prefixes stay literal text inside a code block | |
| EDITOR-22 | Typing `/` in an empty block opens the slash menu listing all ten kinds | |
| EDITOR-23 | The slash query filters the list (`/head` → the three headings) and an unmatched query shows "no match" | |
| EDITOR-24 | ArrowDown/ArrowUp move the slash highlight (wrapping at the ends) and Enter applies the highlighted kind | |
| EDITOR-25 | Clicking a slash item applies that kind, removes the `/query` text and closes the menu | mousedown keeps editor focus |
| EDITOR-26 | Escape closes the slash menu and leaves the typed text in the block | |
| EDITOR-27 | Clicking a to-do's checkbox toggles it as one mutation; undo flips it back | the checkbox is chrome, not content |
| EDITOR-28 | mod+b wraps the selection in bold | |
| EDITOR-29 | mod+i then mod+shift+x stack italic and strike on the same selection | marks ride the ordinary text-commit path |
| EDITOR-30 | mod+e wraps the selection in an inline code span | |
| EDITOR-31 | Clicking a divider selects the whole block; Backspace deletes it | |
| EDITOR-32 | Enter on a selected divider inserts a paragraph after it and puts the caret there | |
| EDITOR-33 | Right-clicking a block opens ITS menu: eight "Turn into" kinds, Move up, Move down, Delete block | eleven buttons, no Numbered list / Divider |
| EDITOR-34 | "Turn into → Heading 2" changes the block's kind, keeps its text and closes the menu | same setKind as prefixes and the slash menu |
| EDITOR-35 | "Move up" / "Move down" reorder the block among its siblings | one fractional-position write |
| EDITOR-36 | "Move up" on the first block and "Move down" on the last leave the order unchanged | |
| EDITOR-37 | "Delete block" asks to confirm; Cancel deletes nothing | menu closes before the dialog opens |
| EDITOR-38 | Confirming "Delete block" removes the block | |
| EDITOR-39 | Right-clicking a second block retargets the menu at THAT block | menu acts on the block under the pointer |
| EDITOR-40 | Deleting every block tears the editor down and offers "+ add the first block", which starts a fresh document | empty document = no editor instance |
