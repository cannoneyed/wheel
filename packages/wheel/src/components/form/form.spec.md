# Form behavior specification

- Form owns native submission, reset, and validation events without replacing browser form behavior.
- Root renders a native `form` by default and passes native form attributes through.
- Submit calls `onSubmit` once with the current native FormData when validation succeeds.
- Invalid submission focuses the first invalid control unless the caller cancels that behavior.
- Validation errors are keyed by control name and clear when the matching control becomes valid.
- Server errors remain visible until the caller clears or replaces them.
- Reset restores every uncontrolled Wheel control to its initial value and clears transient validation state.
- Controlled controls remain authoritative after reset and receive the native reset event.
- Enter submits from eligible text controls. It never submits from multiline text entry.
- Submit and reset buttons outside the DOM subtree work through the native `form` attribute.
- Disabled controls are omitted from FormData. Read-only controls retain their submitted value.
- Async submission exposes state to the caller but does not invent a second loading system.
- Repeated submit is blocked only when the connected submit action is pending and non-interruptible.
- Form does not animate validation content into view. Exit uses only shared motion tokens.
