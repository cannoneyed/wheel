# OTP Field behavior specification

- OTP Field collects a fixed-length one-time code while acting as one form field.
- Root coordinates Input, Group, Slot, and Separator parts and owns one string value.
- `value`, `defaultValue`, and `onValueChange` support controlled and uncontrolled use.
- The hidden or shared input uses `autocomplete="one-time-code"` and an appropriate mobile input mode.
- Typing fills the active slot and advances. Backspace clears the active slot or moves back to clear the prior slot.
- Arrow keys move the active position without changing the value.
- Pasting distributes valid characters across slots, ignores separators, clamps to length, and reports one value change.
- Autofill can replace the whole value in one event.
- Invalid characters are rejected by the configured pattern without moving focus.
- Masked mode hides visual characters while keeping the accessible field name and value policy explicit.
- Slots expose active, filled, and invalid state but are not separate tab stops.
- `sm`, `md`, and `lg` change slot size and gaps together.
- Disabled blocks focus and changes. Read-only remains selectable but does not expose the secret through extra labels.
- Completion fires once per transition into a complete valid code and may fire again after the value becomes incomplete.
- Entry is immediate. Caret state may blink unless reduced motion requests a static caret.
