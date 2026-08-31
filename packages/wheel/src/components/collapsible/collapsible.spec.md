# Collapsible behavior specification

- Collapsible connects one trigger to one region that can be shown or hidden.
- Root owns controlled or uncontrolled open state and does not add a DOM wrapper.
- Trigger renders a button, exposes `aria-expanded`, and names its Panel through `aria-controls`.
- Panel points back to its trigger when it needs an accessible name.
- Pointer activation, `Enter`, and `Space` toggle the panel.
- Disabled state keeps content readable, blocks toggling, and removes an otherwise native trigger from sequential focus.
- `open`, `defaultOpen`, and `onOpenChange` support controlled and uncontrolled use.
- A change callback may cancel an uncontrolled change before state commits.
- Nested Collapsibles keep their controls and state independent.
- Group composition may coordinate one-open or many-open behavior without changing each Collapsible's parts.
- Divided and bare treatments change only the surface. Compact, balanced, and spacious density change spacing.
- Panel content appears immediately when opened. It never fades, slides, or scales in.
- Closing may use the shared 100 ms exit-only motion while the Panel remains mounted.
- Reduced motion removes the exit transition. Forced colors preserve focus and boundaries.
