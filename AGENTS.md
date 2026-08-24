# Wheel Agent Guide

Wheel is a web application framework designed for reliable development by AI agents. It uses `Solid.js` as its render engine. Its core pieces are:

1. A local-first sync engine.
1. Global singleton Services that maintain a state tree and force unidirectional data flow
1. Observable signals (atoms) that allow for rich querying, debugging, and tracing of state
1. Strict conventions for connecting components to global state that optimizes for debuggability, traceability, testability, and maintainability.
1. A suite of linter / developer tooling for maintaining application standards as it evolves and grows over time.

## Lint rules — where, why, how

Lint rules are how this repo turns doctrine into machinery: a convention that isn't enforced by
a tool is an opinion, and opinions drift. When a bug or finding reveals a mistake that could
silently happen again, the fix is not a note in a doc — it's a rule.

**Where:** `packages/wheel/eslint/rules/*.mjs` (plain ESM, no build step), registered in
`packages/wheel/eslint/index.mjs`, wired into layers in the repo-root `eslint.config.mjs`
(kernel / app / package-files / tests — app coverage is wildcard-minus-kernel, so new packages
are linted the moment they exist).

**Run:** `bun run lint` (CI runs it on every push). Zero errors is the only passing state;
escapes are in-file pragmas with a written reason, never glob carve-outs.

**Why each rule exists:** every rule file opens with a `WHY THIS RULE EXISTS` comment telling
the story in plain language — the real bug or failure mode it prevents, with a ❌/✅ example.
The docs site's Linting page mirrors that story. A rule whose "why" can't be explained plainly
with an example is not ready to ship.

**How to create one (the standing procedure):**

1. Write `packages/wheel/eslint/rules/<name>.mjs` — the WHY comment first, then the visitor.
2. Register it in `eslint/index.mjs`; wire it into the right layer(s) of `eslint.config.mjs`.
3. Verify with the Linter API against good/bad samples BEFORE trusting it on the repo
   (see the session pattern: a small script asserting each sample's verdict).
4. Run `bun run lint` repo-wide; fix real violations, never weaken the rule to pass.
5. Add the plain-language row to `content/docs/linting.mdx`.

**Going forward:** any issue, finding, or code-review note whose remedy is "a lint rule could
catch this" gets the rule built in the same change — not filed as a future candidate. If a rule
genuinely can't be built without unacceptable false positives (e.g. `no-prop-drilling`'s
identity-vs-data problem), the blocker is written down where the rule would be documented, and
that written reason is the only accepted substitute for the rule.

## When to break the rules

Override the defaults when:

1. User asks to "explain" or "walk me through." Explain fully. Still no preamble, still no closer, but the body runs as long as the topic needs. Add headers so the reader can skim back.
2. Destructive action ahead (`rm -rf`, force push, schema migration, dropping a table). Confirm before acting. Safety wins over brevity.
3. Debug spiral. If the last three turns have been "still broken," stop iterating on code. Name the assumption that might be wrong. Ask one diagnostic question.
4. Real ambiguity in the request. One short clarifying question beats guessing and rewriting.

## Pre-send check

Before sending, delete:

1. The first sentence if it announces what you are about to do.
2. The last sentence if it asks "anything else?" or recaps what just happened.
3. Any "by the way" sidebar.
4. Any hedging adverb adding no information ("perhaps," "might," "could possibly").

Then verify: if the reader reads only the first line and the last line, do they know (a) what to do next, and (b) what just happened?

If yes, send.

## Time Estimates

Estimates in this repo's planning docs and reports are written in human-team units and run ~50x slower than agent execution. Calibration from measured history: the live-state migration, planned as five sessions of work, landed in about a day; a "3-4 day" topology change is roughly an hour of agent work; a "6-9 week" migration is days.

When writing estimates: state relative size (S/M/L against a named reference task), not durations. When reading estimates from any doc dated before this section existed, divide by ~50 for agent execution. Wall-clock time is dominated by test suites, deliberate verification loops, and waits on human input — not by implementation.

## Solo process management

When `SOLO_PROCESS_ID` is set or `TERM_PROGRAM=solo`, use Solo for every long-running local process. This includes dev servers, watchers, workers, queues, and databases. Do not run these processes in an agent-owned PTY, with `&`, or with `nohup`.

One-shot commands such as tests, builds, formatting, and migrations still run in the agent shell.

1. Confirm the CLI connection with `solo status --json`.
2. Use `SOLO_PROJECT_ID` when it is set; otherwise resolve the project ID by matching the current path in `solo projects list --json`.
3. Find the command with `solo processes list --project-id "$SOLO_PROJECT_ID" --json`.
4. Use `solo processes start`, `stop`, `restart`, and `output` with the returned process ID.

`solo.yml` defines the repository processes. Changes to that file require a human to click **Sync** and approve the commands in Solo.

## Subagent model routing

Every `Agent` spawn sets `model` explicitly. Omitting it inherits the session model — the most expensive tier — so mechanical work silently runs at top cost. Picking the model is part of writing the task, not an afterthought.

Three tiers, cheapest first.

| Model | Use for | Trigger |
|---|---|---|
| **small** (e.g. luna, haiku)| Fully specified, mechanically verifiable work: file moves, find-and-replace renames, codemods, import repointing, dead-code deletion, running a suite and reporting results, applying a precisely dictated edit. | The task has one correct output and tooling (tsc / lint / tests) proves it. No design decision remains. |
| **medium** (e.g. opus, sol) | The workhorse. Judgment without novel architecture: app-code changes, writing docs and comments, authoring tests, localized bug fixes, readability refactors, scrub and audit passes. | Default. Anything not clearly haiku-mechanical or fable-critical. |
| **large** (e.g. fable) | Architecture and correctness-critical work: cross-cutting API and interface design, concurrency and data-integrity code, security-sensitive paths, anything a subtle wrong answer makes expensive and hard to detect. | A wrong-but-plausible result would survive review and cost dearly. Reserve it. |

Rules that go with the tiers:

- A small or medium agent that hits a real decision stops and reports rather than guessing — cheap models stay in their lane, and the decision returns to a tier meant to make it.
- Direct verification (tsc, lint, tests, git) is Bash from the main loop and costs no subagent tokens. Gate liberally between steps; never spend a subagent to run a command.
- Analysis and exploration split the same way: inventory-and-locate reads use haiku; review that weighs tradeoffs or judges a design uses opus or fable.
- Batch independent children in one turn, but route each by its own tier — a mechanical mover and a design task launched together take haiku and fable respectively, not one shared model.
- `sonnet` or `terra` is not used in this repo; `opus` or `sol` is the mid tier.

## Style

Always respond using simple language.

Key rules:

- **Use simple language and no jargon**. Each word has one meaning.

- **Use one word for one idea.** Do not use two words for the same thing.

- **Write short sentences.** Try to use 20 words or less for an instruction, and 25 or less for everything else.

- **Use active voice.** Write "Turn the switch", not "The switch must be turned".

- **Say why, not only what.** A result with no reason makes the reader do your work again.

- **Write short paragraphs.** Keep one topic in each paragraph. A paragraph holds up to six sentences, so one sentence per paragraph is not the standard.

The goal is easy reading. Many readers are not native English speakers. Clear text helps them do the work in a safe and correct way.

**Length is not style.** A reply is short, because the reader opens it to learn what to do next. A document is complete, because the document is the deliverable: give the background, name what you ruled out, and state the reason for the choice.

## Coding Approaches

- Study how established products solve the problem before designing a solution. Adopt their proven patterns and conventions rather than inventing an approach from scratch.

- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.

- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.

- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.

- Keep components modular and concerns clearly separated.

- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason (Note this emphatically does NOT apply to the `wheel` system which this app relies on)

- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.

- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
