---
name: doc-writing
description: House style for writing and editing documentation — READMEs, docs pages, guides, and reference material. Use whenever authoring or revising user-facing markdown docs. Modeled on the earendil-works/pi docs; dense, factual, zero filler.
---

# Doc Writing

Write documentation the way the [pi docs](https://github.com/earendil-works/pi) do: every sentence states a fact the reader can act on, structure follows the reader's workflow, and nothing is written to impress. This skill defines that style as rules. [references/exemplars.md](references/exemplars.md) holds annotated excerpts from the pi docs to calibrate against.

## Voice

- Declarative, present tense. The product is the actor ("Pi loads skills from:", "Auto-compaction triggers when:"). The reader is "you".
- State each fact once. Do not preview a section's content and do not recap it afterward.
- Attach the reason inline, in one sentence, when a rule or default would otherwise look arbitrary: "`--ignore-scripts` disables dependency lifecycle scripts during install. Pi does not require install scripts for normal npm installs."
- State limitations plainly, next to the feature they qualify: "models don't always do this; use prompting or `/skill:name` to force it." Never soften a limitation and never collect caveats into a dump at the end.
- When the project deviates from a standard or common convention, say so and give the reason in one sentence. Opinion is fine; hedging is not.
- Paragraphs are 1-3 sentences. A paragraph that wants to be longer is usually a list or a table.

## Page anatomy

One page covers one topic, named by a noun (`skills.md`, `compaction.md`, `sessions.md`).

1. `# Title`
2. One to three sentences defining the topic and what the page covers. At most one sentence of motivating context, and only if it is a fact: "LLMs have limited context windows. When conversations grow too long, pi uses compaction to summarize older content."
3. Sections in the reader's workflow order: what it is → quick usage / where things live → how it works → reference tables → examples → advanced or extension points → settings.
4. Entry-point pages end with annotated next-step links. Every other page just ends. No conclusion section.

Add a table of contents only when the page exceeds roughly 150 lines.

Index pages are annotated link lists grouped by reader intent ("Start here", "Customization", "Reference"), one line per link:

```markdown
- [Quickstart](quickstart.md) - install, authenticate, and run a first session.
```

## Artifacts

Show, don't describe. Pick the artifact by the shape of the information:

| Information | Artifact |
|---|---|
| Anything runnable | Code block that works as pasted; explain non-obvious flags in a sentence after the block |
| Options, fields, settings | Table (`Setting / Default / Description` or `Field / Required / Description`); always state defaults |
| Procedures | Numbered list, one action per step; bold lead only for named phases ("**Find cut point**: walk backwards...") |
| State, layout, before/after transformations | Labeled ASCII diagram |
| File layout | Directory tree with per-line `#` comments |
| Quality bar for freeform input | Paired `Good:` / `Poor:` examples |
| Security or data-loss caveat | Blockquote with bold label: `> **Security:** ...` |

Rules that go with them:

- Code blocks run as written. No `<placeholders>` unless the syntax requires them, and then also show a filled-in example.
- Do not restate in prose what a table or code block already shows. Trailing `#` comments inside the block replace explanatory prose.
- Use `code` spans for every identifier: commands, paths, flags, settings keys, env vars, types, keybindings.
- When documenting internals, link the source files with a one-line description each, so the code stays the ground truth.
- Inline key-value facts stay in prose; three or more related ones become a table.

## Links

- Link to a section of another page by header ID (`compaction.md#cut-points`) — never with § symbols and never as prose ("see section 3 of the engine doc").
- References flow downward only. Repo documentation links to other repo docs and source files, never to session or workspace documents (plans, implementation logs, review threads). Sessions sit above the repo: a session may cite the repo; the repo stands alone and stays legible to a reader with no session context.

## Density

The test for every sentence: does deleting it lose a fact a reader could act on? If not, delete it.

- The first sentence after a heading carries content. Never restate the heading.
- No transitions between sections ("Now that we've covered..."). Headings are the transitions.
- Numbers over adjectives: "default 20k, configurable in `settings.json`", not "a sensible default".
- If two adjacent sentences share a subject, try merging them. If one sentence serves two audiences, split it.
- Edge cases get the same flat register as the main path. An edge case explained defensively reads as an apology; explained flatly it reads as a spec.

## Forbidden

These read as generated filler. Never write them; remove them on sight when editing.

Words and phrases: load-bearing, battle-tested, robust, seamless, powerful, comprehensive, crucial, essential, leverage, utilize, delve, dive into, explore, journey, streamline, supercharge, elevate, unlock, empower, "simply", "just"/"easily" as minimizers, "note that", "it's worth noting", "importantly", "keep in mind", "at its core", "under the hood" (name the file instead).

Constructions:

- "It's not X, it's Y" / "not just X — it's Y" contrast framing. State Y.
- Rhetorical questions as section openers ("So how does compaction work?"). Use a heading.
- Triadic flourishes ("fast, flexible, and reliable"). Keep the one that is true and support it with a number.
- Audience flattery ("Whether you're a beginner or a seasoned expert...").
- Bold-led bullets where the bold term is not a defined term ("**Fast**: it runs fast").
- Em-dash punchlines ("— and that's the point").
- Hedges on known facts ("should generally", "may typically"). If behavior is conditional, state the condition.
- Exclamation marks, emojis, "Let's", authorial "we" that includes the reader.
- Summary sections ("In summary", "Wrapping up", "Conclusion").
- Reassurance ("Don't worry", "This may sound complicated, but...").

Structure smells:

- A notes/caveats section at the end of a page. Each caveat lives next to the claim it qualifies.
- Aspirational behavior ("will support", "is planned") mixed with current behavior. Document what exists; link an issue or RFC for plans.
- The same fact maintained on two pages. One page owns each fact; other pages link to it.
- Sections that exist for symmetry ("Advantages" / "Disadvantages") rather than because there is content.

## Editing existing docs

Apply the same bar sentence by sentence: delete filler, merge duplicated facts into the owning page and link from the others, convert prose enumerations to tables, convert described behavior into runnable examples, and move buried caveats next to their claims. Preserve facts exactly; if a claim cannot be verified from the code or the change being documented, flag it instead of paraphrasing it.
