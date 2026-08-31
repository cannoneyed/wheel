# Autocomplete behavior specification

- Autocomplete is an opinionated text field that offers filtered suggestions without requiring a selected value.
- Root composes Combobox input, popup, list, item, status, empty, loading, clear, and portal parts.
- Input value and selected suggestion state remain separate.
- Controlled and uncontrolled input state report every user edit. Optional selected value reports commits separately.
- Typing filters local items or requests async results without blocking further input.
- Stale async responses never replace results for newer input.
- `ArrowDown` and `ArrowUp` open the popup and move through enabled suggestions.
- `Enter` commits the active suggestion. `Escape` closes without replacing the input. Tab follows the configured completion policy.
- Typeahead never traps focus and never changes input solely because focus moved.
- Rich items may include icons, descriptions, and passive metadata while retaining one option label.
- Empty and loading states are announced once and are not selectable options.
- `sm`, `md`, and `lg`, input and ghost surfaces, and success, warning, and error status use shared field tokens.
- Disabled blocks input and selection. Read-only permits selection and copy but never opens suggestions.
- Selecting, closing, and reopening supports a different pointer or keyboard result every time.
- Popup entry is immediate. Close uses only the shared 100 ms fade-out.
