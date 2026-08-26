# Number Field behavior specification

- Number Field edits a numeric value through text entry, keyboard steps, and increment or decrement controls.
- Root coordinates Input, Increment, Decrement, Group, ScrubArea, and ScrubAreaCursor parts.
- `value`, `defaultValue`, and `onValueChange` support controlled and uncontrolled numbers or null.
- Input exposes spinbutton semantics, the current value, bounds, and required state.
- `ArrowUp` and `ArrowDown` step once. `PageUp` and `PageDown` use the large step. Home and End reach finite bounds.
- Increment and Decrement repeat at a bounded rate while held and stop on release, cancel, blur, or disabled state.
- Pointer scrubbing captures the pointer, changes by configured sensitivity, and restores the cursor on every exit path.
- Min, max, and step clamp committed values. Decimal math avoids visible binary rounding errors.
- Empty input maps to null when allowed. Invalid text does not commit a number.
- Locale formatting and parsing keep decimal, grouping, sign, and numeral rules aligned.
- `sm`, `md`, and `lg` change every part's density together.
- Input and ghost variants plus success, warning, and error status use shared field styling.
- Disabled blocks every part. Read-only permits selection but blocks typing, buttons, wheel, and scrubbing.
- Wheel changes are opt-in and occur only while Input is focused.
- Entry is immediate. Scrub and press feedback use shared state motion; no part fades in.
- Browser proof covers repeat, scrub, keyboard, locale, bounds, decimals, reset, and repeated controlled changes.
