# Exemplars

Annotated excerpts from the [pi docs](https://github.com/earendil-works/pi), the model for this style. Each excerpt shows one technique worth imitating.

## Inline "why" on a surprising instruction

From `docs/quickstart.md`:

> ```bash
> npm install -g --ignore-scripts @earendil-works/pi-coding-agent
> ```
>
> `--ignore-scripts` disables dependency lifecycle scripts during install. Pi does not require install scripts for normal npm installs.

The flag would look paranoid without explanation. Two sentences after the block: what the flag does, why it is safe here. No security lecture.

## Definition-first page opening

From `docs/compaction.md`:

> LLMs have limited context windows. When conversations grow too long, pi uses compaction to summarize older content while preserving recent work. This page covers both auto-compaction and branch summarization.

Three sentences: the problem as a fact, the mechanism, the page scope. No "In this guide, we'll explore...".

## Mechanics as numbered phases plus a diagram

From `docs/compaction.md`:

> 1. **Find cut point**: Walk backwards from newest message, accumulating token estimates until `keepRecentTokens` (default 20k, configurable in `~/.pi/agent/settings.json`) is reached
> 2. **Extract messages**: Collect messages from the previous kept boundary (or session start) up to the cut point
> 3. **Generate summary**: Call LLM to summarize with structured format, passing the previous summary as iterative context when present

Each step: bold phase name, one action, defaults and config location inline. The section then shows a labeled ASCII diagram of entries before and after compaction — the transformation is drawn, not narrated.

## Good/Poor pairs for quality bars

From `docs/skills.md`:

> The description determines when the agent loads the skill. Be specific.
>
> Good:
> ```yaml
> description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents.
> ```
>
> Poor:
> ```yaml
> description: Helps with PDFs.
> ```

One sentence of rule, then contrasting examples. No enumeration of what makes descriptions good.

## Blunt limitation, flat register

From `docs/skills.md`:

> When a task matches, the agent uses `read` to load the full SKILL.md (models don't always do this; use prompting or `/skill:name` to force it)

A known failure mode of the product, stated parenthetically with the workaround, in the same tone as everything else.

## Opinionated deviation from a standard

From `docs/skills.md`:

> Pi implements the [Agent Skills standard](https://agentskills.io/specification), warning about most violations but remaining lenient. Pi allows skill names to differ from their parent directory even though the standard disallows it; that rule is suboptimal for shared skill directories used across multiple agent harnesses.

Compliance stated, deviation stated, reason given in one clause. No apology, no "we believe".

## Index entries as annotated links

From `docs/index.md`:

> - [Quickstart](quickstart.md) - install, authenticate, and run a first session.
> - [Extensions](extensions.md) - TypeScript modules for tools, commands, events, and custom UI.

Each annotation is a noun-phrase inventory of what the page contains, not a pitch for reading it.

## Reference tables with defaults

From `docs/compaction.md`:

> | Setting | Default | Description |
> |---------|---------|-------------|
> | `enabled` | `true` | Enable auto-compaction |
> | `reserveTokens` | `16384` | Tokens to reserve for LLM response |
> | `keepRecentTokens` | `20000` | Recent tokens to keep (not summarized) |
>
> Disable auto-compaction with `"enabled": false`. You can still compact manually with `/compact`.

The table carries the facts; the prose after it covers only what the table cannot express (the interaction between the setting and `/compact`).
