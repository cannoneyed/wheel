# Toggle Group specification

Toggle Group coordinates related Toggle values with single-select or multi-select state and one roving focus stop.

## Contract

- `ToggleGroup` renders a `div` with `role="group"`.
- Every group has an accessible name from `aria-label` or `aria-labelledby`.
- The stable identity is `wheel-ToggleGroup` with `data-slot="toggle-group"`.
- `type="single"` uses `string | null` values. The default type is `single`.
- `type="multiple"` uses a readonly string array.
- `value` controls selection. `defaultValue` supplies the initial uncontrolled selection.
- `onValueChange` receives the next typed value and cancelable event details before state commits.
- Canceling the event details keeps the current value.
- A single group can have no selection. Pressing the selected item clears it to `null`.
- A multiple group preserves item order and never adds the same value twice.
- Each child Toggle has a unique non-empty `value`.
- `orientation` supports `horizontal` and `vertical`. The default is `horizontal`.
- `layout` supports `hug` and `fill`. The default is `hug`.
- `size` supports `sm`, `md`, and `lg`. The default is `md`.
- `variant` supports `primary`, `secondary`, `ghost`, and `destructive`. The default is `secondary`.
- `disabled` disables every child Toggle.
- Resolved state appears as `data-type`, `data-orientation`, `data-layout`, `data-size`, `data-variant`, and `data-disabled`.
- `class` and `style` accept state functions. State exposes `disabled`, `type`, `orientation`, `layout`, `size`, and `variant`.

## Keyboard and focus

- The group is one Tab stop when it has at least one enabled Toggle.
- Horizontal groups use Left and Right Arrow. Vertical groups use Up and Down Arrow.
- Home moves focus to the first enabled Toggle. End moves focus to the last enabled Toggle.
- Arrow focus wraps when `loopFocus` is true. The default is true.
- Roving focus skips disabled Toggles.
- Right-to-left direction reverses Left and Right Arrow movement.
- Arrow movement changes focus only. Enter, Space, or pointer activation changes selection.
- The group does not add `aria-orientation` because `role="group"` does not define that property.
- Nested groups and mixed non-Toggle actions are unsupported because they create conflicting state and focus owners.

## Layout and visual behavior

- `hug` sizes the group to its content.
- `fill` stretches the group to the available inline size and gives each direct Toggle equal space.
- Vertical `fill` stretches each Toggle across the group width.
- The group renders a compact segmented well with visible pressed states.
- Toggle state entry is immediate. State removal uses the fast exit transition.
- Selection does not move layout or focus.
- Focus remains visible in light, dark, custom, forced-color, and high-contrast themes.
- Reduced-motion mode removes state transitions.

## Toolbar composition

- A Toggle Group inside `Toolbar.Root` uses the Toolbar composite instead of creating a nested composite.
- Toolbar and Toolbar Group disabled state flows to each Toggle.
- Toolbar orientation owns arrow movement when the Toggle Group uses the Toolbar composite.
