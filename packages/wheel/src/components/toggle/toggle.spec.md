# Toggle specification

Toggle is a two-state button for a temporary pressed choice such as formatting, view mode, mute, or favorite.

## Contract

- `Toggle` renders a native button by default and exposes state with `aria-pressed`.
- `pressed` controls state. `defaultPressed` supplies the initial uncontrolled state.
- `onPressedChange` receives the next state and cancelable event details before state commits.
- Canceling the event details keeps the current state.
- The stable identity is `wheel-Toggle` with `data-slot="toggle"`, including inside `ToggleGroup`.
- `Toggle` supports `primary`, `secondary`, `ghost`, and `destructive` visual variants. The default is `ghost`.
- `Toggle` supports `sm`, `md`, and `lg` sizes. The default is `md`.
- `label` supplies visible text when `children` is absent.
- `icon` renders before visible text. `pressedIcon` replaces it while pressed.
- An icon-only toggle requires `label`; the label becomes `aria-label`.
- `data-pressed`, `data-variant`, `data-size`, `data-icon-only`, and `data-disabled` expose resolved state.
- `class` and `style` accept state functions. State exposes `pressed`, `disabled`, `variant`, `size`, and `iconOnly`.

## Activation and state

- Pointer click, Enter, and Space invert the state once.
- A controlled Toggle requests a change but does not commit without a new `pressed` value.
- `disabled` blocks pointer and keyboard changes and removes a native button from the tab order.
- A non-native element receives button semantics and Enter and Space activation when `nativeButton={false}`.
- The accessible label stays the same between pressed and unpressed states.
- Toggle is not a one-time action and does not replace `Button`.
- A saved on/off setting uses `Switch`; Toggle represents a pressed tool or choice.

## Group composition

- A Toggle inside `ToggleGroup` requires a unique `value`.
- Group selection owns the pressed state and ignores standalone `pressed` and `defaultPressed` values.
- Group size, variant, and disabled state apply unless the Toggle sets its own size or variant.
- Grouped Toggles participate in one roving tab stop.
- The Toggle keeps `wheel-Toggle`, `data-slot="toggle"`, and all state attributes inside a group.

## Visual behavior

- Unpressed state uses a low-emphasis surface. Pressed state uses the selected variant surface.
- The pressed state never depends on icon color alone; background, border, or text weight also changes.
- State entry is immediate. State removal uses the fast exit transition.
- Icon swapping does not change the control dimensions.
- Focus remains visible in light, dark, custom, forced-color, and high-contrast themes.
- Logical spacing supports right-to-left layouts.
- Reduced-motion mode removes state transitions.

## Proof

- Unit tests cover controlled and uncontrolled state, cancellation, disabled behavior, non-native activation, variants, sizes, labels, icon swap, icon-only naming, and group inheritance.
- Browser tests cover pointer and keyboard changes plus focus movement inside a group.
- Catalog fixtures show every variant and size plus pressed, unpressed, icon-only, labeled, and disabled states.
- Light, dark, and custom-theme screenshots cover the fixture at the catalog width.
