# Code Block specification

Code Block presents source text with design-system spacing, syntax tokens, and overflow behavior.

## Contract

- `CodeBlock` renders a `pre` containing one `Code` element.
- `Code` renders an inline `code` element and can be used without a surrounding block.
- `code` is the source of truth and remains the readable text when no highlighted markup is supplied.
- `highlightedHtml` accepts trusted syntax-token markup generated from the same `code` source.
- Code Block does not bundle or choose a syntax engine. Applications can highlight at build time or supply tokens from their existing highlighter.
- `language` appears as `data-language` on the rendered code for inspection.
- `label` gives a block an accessible name.
- The stable identities are `wheel-CodeBlock` with `data-slot="code-block"` and `wheel-Code` with `data-slot="code"`.
- `class` and `style` accept state functions. Block state exposes `language` and `wrap`; inline state exposes `language`.

## Layout and visual behavior

- Code Block uses the design-system monospace font, sunken surface, border, radius, and compact source spacing.
- Long lines scroll horizontally by default.
- `wrap` keeps long lines inside the available width and exposes `data-wrap`.
- Inline Code uses compact horizontal padding without forcing a new line.
- Syntax colors come from semantic code tokens and remain readable in light, dark, custom, and forced-color themes.
- Code Block has no entry or exit animation.
- Selected source text uses the system selection colors.

## Composition

- `CodeBlock` forwards native `pre` attributes, refs, data attributes, and ARIA attributes.
- `Code` forwards native `code` attributes, refs, data attributes, and ARIA attributes.
- A highlighter must escape source text before placing token markup in `highlightedHtml`.
- Copy actions, filenames, captions, and language selectors remain separate components composed around Code Block.
