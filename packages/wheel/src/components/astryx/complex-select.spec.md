# ComplexSelect behavior specification

- Chooses a rich value with supporting metadata and actions.
- Astryx family coverage: `Selector`; sizes `sm`–`lg`; input/ghost; status. `SelectorOption`; stacked/inline. `MultiSelector`, `ComplexSelector`
- Wheel family contract: Merge Selector into Wheel Select. Add Multi Select and Complex Select as separate entries that reuse collection and popup logic.
- The component renders its semantic default element and supports `as` and `asChild` composition without an extra wrapper.
- `sm`, `md`, and `lg` use the shared control and type scale when size changes the component.
- Compact density is the default. Balanced and spacious density increase token-based gaps without changing behavior.
- Neutral, accent, info, success, warning, and error tones use shared semantic tokens and preserve readable contrast.
- Variant props change presentation without changing roles, labels, value ownership, or event order.
- Disabled state remains readable, exposes `aria-disabled`, and blocks native activation where the rendered element supports it.
- Pointer, keyboard, and touch input produce the same committed state and never fire twice.
- Focus stays visible, follows the component semantics, and returns to its logical owner after dismissal.
- Mounted content appears on the first frame. The component never fades, slides, or scales in.
- Dismissed content may use the shared 100 ms exit-only motion. Reduced motion removes that exit.
- Forced colors preserve boundaries, focus, current state, and status without relying on color alone.
- Unit proof covers semantic defaults, composition props, design attributes, disabled state, and state callbacks.
- Browser proof covers the complete pointer and keyboard sequence, responsive layout, right-to-left layout, and repeated use.
