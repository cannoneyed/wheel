# Radio Group behavior specification

- Radio Group coordinates a mutually exclusive set of Radio values.
- Root exposes radiogroup semantics and receives a visible or explicit accessible name.
- `value`, `defaultValue`, and `onValueChange` support controlled and uncontrolled use.
- Exactly one enabled option can be selected. An optional group may begin with no selection.
- Arrow keys move focus and selection to the next enabled option according to orientation and text direction.
- `Home` and `End` move to the first and last enabled options.
- Tabbing enters the selected option, or the first enabled option when no value exists, and leaves with one Tab press.
- Horizontal and vertical orientation affect both layout and arrow keys.
- Rich list items may add descriptions and passive end content while preserving one radio control and label per row.
- Compact, balanced, and spacious density change row spacing. Radio size stays on the shared size scale.
- Group disabled and read-only state reaches every child. Per-item disabled state remains local.
- Required state is satisfied only by a selected enabled value and reaches native form validation.
- Status messages describe the whole group and connect through `aria-describedby`.
- Selection appears immediately. No indicator or row fades in.
