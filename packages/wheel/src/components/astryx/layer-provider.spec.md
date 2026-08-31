# LayerProvider behavior specification

- Provides a shared portal root and layer order.
- Astryx family coverage: `InternationalizationProvider`, `LayerProvider`, `LinkProvider`, `MediaTheme`, `SyntaxTheme`, `Theme`; light/dark/system and media modes
- Wheel family contract: Add small providers for locale, layer roots, router links, media, syntax, and theme. Merge direction into the locale contract and preserve subtree themes.
- The component renders its semantic default element and supports `as` and `asChild` composition without an extra wrapper.
- `sm`, `md`, and `lg` use the shared control and type scale when size changes the component.
- Compact density is the default. Balanced and spacious density increase token-based gaps without changing behavior.
- Neutral, accent, info, success, warning, and error tones use shared semantic tokens and preserve readable contrast.
- Variant props change presentation without changing roles, labels, value ownership, or event order.
- Disabled state remains readable, exposes `aria-disabled`, and blocks native activation where the rendered element supports it.
- The component does not add keyboard stops or interactive roles unless its rendered content requires them.
- Content order remains stable for screen readers, zoom, and right-to-left layouts.
- Mounted content appears on the first frame. The component never fades, slides, or scales in.
- Dismissed content may use the shared 100 ms exit-only motion. Reduced motion removes that exit.
- Forced colors preserve boundaries, focus, current state, and status without relying on color alone.
- Required unit proof covers semantic defaults, composition props, design attributes, disabled state, and state callbacks.
- Required browser proof covers the complete pointer and keyboard sequence, responsive layout, right-to-left layout, and repeated use.
