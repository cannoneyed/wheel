# Alert Dialog behavior specification

- Alert Dialog interrupts work for a decision whose effect is important, destructive, or difficult to reverse.
- Root composes Trigger, Portal, Backdrop, Viewport, Popup, Title, Description, Close, and action content.
- Popup exposes `alertdialog` semantics and receives its accessible name from Title.
- A clear Description states the consequence or decision context.
- Opening moves focus to the safest meaningful action unless the caller explicitly identifies another target.
- Destructive actions never receive initial focus by visual order alone.
- Tab and Shift+Tab remain inside the open dialog.
- Escape and backdrop dismissal are disabled by default for decisions that require an answer. The caller may opt in.
- Closing restores focus to Trigger or an explicit final focus target.
- Controlled and uncontrolled open state report reasons and permit cancellation before state commits.
- Confirm and cancel actions remain ordinary Button components. Async actions own pending state and prevent accidental repeat.
- Non-dismissible mode always provides an enabled decision path.
- Standard and destructive treatments change action emphasis, not dialog semantics.
- Entry is immediate. Backdrop and Popup never fade, slide, or scale in.
- Close may use the shared 100 ms fade-out. State, focus restoration, and action completion do not wait for the fade.
- Browser proof covers focus choice, trapping, dismissal policy, async confirm, nested layers, and repeated open-close cycles.
