# Separator behavior specification

- Separator divides related content visually, semantically, or both.
- Decorative separators are hidden from the accessibility tree.
- Semantic separators expose `separator` role and the configured horizontal or vertical orientation.
- Horizontal and vertical orientation use the shared hairline token and never rely on text glyphs.
- Inset variants align the line with dense list text, icons, or full container edges.
- Strong and subtle tones use shared border tokens.
- Separator does not receive focus or pointer events.
- Separator accepts native class, style, and composition props without adding wrappers.
- High zoom keeps a visible one-device-pixel boundary where the platform permits.
- Forced colors maps semantic lines to system colors.
- Separator has no motion.
- Visual proof covers both orientations, every inset, themes, forced colors, and scaled display density.
