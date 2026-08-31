# Input behavior specification

- Input is the styled native single-line text control.
- It preserves native input types, attributes, selection, autofill, undo, spellcheck, and form behavior.
- `value`, `defaultValue`, `onInput`, and `onChange` support native controlled and uncontrolled patterns.
- `sm`, `md`, and `lg` sizes use the shared control height and type scale.
- Input, ghost, and quiet variants change the resting surface without changing semantics.
- Neutral, success, warning, and error status use shared field tones. Error status also reflects invalid semantics when owned by Field.
- Disabled blocks interaction and is omitted from form submission. Read-only remains focusable and selectable.
- Placeholder text never replaces a visible or programmatic label.
- Password reveal composes an IconButton and preserves selection, focus, value, and password-manager behavior.
- Search composition adds clear and optional submit actions without changing the native value event.
- Leading and trailing content do not cover text at high zoom or with long values.
- Clear actions have an accessible name, clear once, and return focus to Input.
- Input does not animate into view. Border and background state transitions use shared short tokens.
- Forced colors preserve the boundary, caret, selection, placeholder, and invalid state.
