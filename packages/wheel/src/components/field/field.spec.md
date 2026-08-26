# Field behavior specification

- Field connects one form control to its label, description, validation message, and validity state.
- Root supplies stable ids and state to its parts without requiring application services.
- Label focuses or activates the associated control through native labeling semantics.
- Description and Error ids are merged into the control's `aria-describedby` value without discarding caller ids.
- Error appears only for matching validation state unless the caller keeps it mounted.
- Error text uses `aria-live` only when a new error needs announcement. It does not repeat on every render.
- Required state reaches the control and has a visible text or symbol whose meaning is available to assistive technology.
- Disabled state reaches all participating controls while keeping labels and messages readable.
- Read-only state reaches controls that support it and remains distinct from disabled state.
- Success, warning, and error status can show attached or detached messages.
- Error status maps to invalid semantics. Success and warning are visual and descriptive, not native validity values.
- Field Item composes repeated controls under one shared field label without duplicating ids.
- Horizontal and vertical layout remain compositions of the same parts.
- Compact, balanced, and spacious density use shared control and message spacing.
- Field never animates messages into view. Removed messages may use the shared 100 ms fade-out.
- Forced colors preserve invalid boundaries and text. Zoom and long translations do not overlap the control.
- Unit proof covers id merging, validation modes, form reset, fill, dirty, touched, and controlled validity.
