# Switch behavior specification

- Switch changes one setting between on and off.
- Root renders switch semantics and Thumb reflects checked state.
- `checked`, `defaultChecked`, and `onCheckedChange` support controlled and uncontrolled use.
- Pointer activation and `Space` toggle once. `Enter` follows platform button behavior only when the rendered element supports it.
- A visible label or explicit accessible name is required.
- Disabled blocks focus and changes. Read-only stays focusable but cannot change.
- Required state reaches the hidden native checkbox and form validation.
- Name, value, form, and unchecked value integrate with native submission.
- `sm` and `md` change track and thumb geometry together while retaining a usable hit target.
- Neutral, success, warning, and error status keep both positions readable in light and dark themes.
- Thumb motion uses the shared short state token. Checked state updates before motion completes.
- Initial render shows the final thumb position and never slides in from the opposite value.
- Reduced motion moves Thumb immediately. Forced colors preserves track boundary, Thumb, checked state, and focus.
