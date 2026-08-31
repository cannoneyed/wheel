# Combobox behavior specification

- Combobox combines editable text with a popup collection and optional committed values.
- Root composes Input, Trigger, Clear, Value, Chips, Chip, List, Item, Group, GroupLabel, Empty, Status, Popup, Positioner, Arrow, and Portal parts.
- Input text, open state, active option, and committed value remain distinct state channels.
- Single mode commits one value. Multiple mode composes removable Chips and retains input for further values.
- Controlled and uncontrolled state report value, input, and open changes with reasons and cancellation.
- Arrow keys open and navigate enabled options. Home, End, PageUp, and PageDown work within long lists.
- Enter commits the active option. Escape closes and restores the configured text. Tab follows the explicit commit policy.
- Pointer hover may highlight without committing. Pointer selection commits once and preserves focus policy.
- Free-text mode permits values not present in the collection. Strict mode restores or clears invalid text on commit.
- Rich, grouped, empty, loading, and error results keep valid listbox structure and announcements.
- Async results ignore stale responses. Virtualized results preserve active option ids and scroll the active row into view.
- Multiple mode supports chip focus, Backspace removal, keyboard removal, limits, duplicates policy, and paste composition.
- `sm`, `md`, and `lg`, input and ghost variants, and field status change all visible parts together.
- Disabled and read-only state cover input, trigger, clear, chips, and options.
- Select, close, and reopen sequences work repeatedly for pointer, keyboard, and touch input.
- Popup entry is immediate. Exit uses the shared 100 ms fade-out and never blocks focus restoration.
