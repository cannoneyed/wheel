# Button Group specification

Button Group joins related actions into one connected control without adding selection state.

## Contract

- `ButtonGroup` renders a `div` with `role="group"`.
- Every group has an accessible name from `aria-label` or `aria-labelledby`.
- The stable identity is `wheel-ButtonGroup` with `data-slot="button-group"`.
- The group accepts `Button` and `IconButton` members. Toggle choices belong in `ToggleGroup`.
- `orientation` supports `horizontal` and `vertical`. The default is `horizontal`.
- `size` supports `sm`, `md`, and `lg`. The default is `md`.
- `variant` supports `primary`, `secondary`, `ghost`, and `destructive`. The default is `secondary`.
- `disabled` disables every member but does not change their labels or order.
- Group state appears as `data-orientation`, `data-size`, `data-variant`, and `data-disabled`.
- `class` and `style` accept state functions. State exposes `disabled`, `orientation`, `size`, and `variant`.

## Composition and layout

- Members inherit the group size and variant unless a member sets its own value.
- Members keep their own event handlers, form behavior, links, loading state, and accessible names.
- The group never converts button actions into selection.
- Horizontal groups connect inline edges and keep only the two outer corner pairs rounded.
- Vertical groups connect block edges and keep only the top and bottom corner pairs rounded.
- Adjacent borders collapse into one separator without changing member dimensions.
- Right-to-left layout reverses horizontal movement and keeps logical start and end corners correct.
- A focused or pressed member paints above adjacent members so its ring and border remain visible.
- A group sizes to its content. Application layout can stretch the group through `class` or `style`.
- Nested `ButtonGroup` components are unsupported because nested roving focus creates two owners for the same keys.

## Keyboard and focus

- The group is one Tab stop when it has at least one enabled member.
- Tab enters the current roving item and then leaves the group on the next Tab.
- Horizontal groups use Left and Right Arrow. Vertical groups use Up and Down Arrow.
- Home moves focus to the first enabled member. End moves focus to the last enabled member.
- Arrow focus wraps when `loopFocus` is true. The default is true.
- Arrow focus stops at the ends when `loopFocus` is false.
- Roving focus skips disabled members.
- Arrow movement changes focus only. It does not activate a member.
- Enter and Space activate the focused member with its native semantics.
- The group does not add `aria-orientation` because `role="group"` does not define that property.
- When every member is disabled, no member remains in the tab order.

## Visual behavior

- The group uses no entry animation.
- Member hover and pressed states follow the Button exit-only motion rule.
- The connected surface stays compact in all three sizes.
- Forced-color mode keeps outer boundaries, separators, and focus visible.
- Reduced-motion mode removes member state transitions.

## Proof

- Unit tests cover semantics, naming, inheritance, disabled propagation, both orientations, loop behavior, skipped members, Home, End, links, and member overrides.
- Browser tests cover one-tab-stop entry, arrow movement, activation, right-to-left movement, and vertical groups.
- Catalog fixtures show horizontal, vertical, mixed Button and IconButton content, all sizes, all variants, links, loading, and disabled members.
- Light, dark, and custom-theme screenshots cover the fixture at the catalog width.
