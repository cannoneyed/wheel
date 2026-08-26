# Code behavior specification

- Code presents short inline source, identifiers, paths, or machine-readable values.
- Astryx family coverage includes `Code` plus `CodeBlock` in `sm` and `md` sizes.
- Wheel keeps inline Code and fenced Code Block in one syntax family with language, copy, wrap, scroll, highlight, and terminal treatments.
- Code renders a semantic `code` element and supports `as` and `asChild` composition without an extra wrapper.
- Plain text remains the source of truth when highlighted markup is absent or cannot load.
- Highlighted markup is sanitized by the caller and never replaces the accessible text value.
- Language metadata controls token classes without changing copy, selection, or reading order.
- Code inherits surrounding type by default and uses the shared monospace font.
- Long inline values wrap only when the caller enables wrapping; otherwise they preserve source spacing.
- Light, dark, custom, forced-color, and print themes keep text readable.
- Code appears on the first frame and has no entry, exit, or state animation.
- Unit proof covers plain text, highlighted markup, language metadata, polymorphic rendering, and class composition.
- Browser proof covers selection, copy, wrapping, overflow, zoom, and every catalog theme.
