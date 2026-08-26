# Context Menu behavior specification

- Context Menu exposes actions for the pointer or touch target where it was invoked.
- Root composes Trigger and the full Menu item, group, checkbox, radio, submenu, separator, popup, portal, and positioning parts.
- Right click opens at the pointer coordinates and prevents the native context menu only while enabled.
- Keyboard invocation opens near the focused Trigger and focuses the first enabled item.
- Touch long press opens after the shared long-press threshold and cancels on movement, scroll, multi-touch, or release.
- Arrow keys, Home, End, typeahead, Enter, and Space follow Menu behavior.
- Escape closes the deepest menu first and restores focus to Trigger for keyboard invocation.
- Pointer dismissal closes the tree without moving focus to a hidden item.
- Links preserve anchor semantics. Checkbox and radio items preserve their selected state. Destructive items use explicit intent.
- Submenus open from pointer intent or ArrowRight, avoid accidental diagonal closure, and mirror in right-to-left layouts.
- `sm`, `md`, and `lg` change popup, row, icon, shortcut, and submenu density together.
- Collision keeps every open level inside its boundary and may flip independently.
- Entry is immediate at every level. Closing levels use the shared 100 ms fade-out.
- Forced colors preserves highlighted, selected, disabled, destructive, and focused states.
- Browser proof covers mouse, pen, long press, keyboard invocation, nesting, collision, RTL, and repeated openings.
