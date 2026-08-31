# Dialog behavior specification

- Dialog presents focused content above the current page without changing routes.
- Root composes Trigger, Portal, Backdrop, Viewport, Popup, Title, Description, and Close parts.
- Popup exposes dialog semantics, uses Title as its accessible name, and connects Description when present.
- Opening moves focus to an explicit initial target or the first useful focusable control.
- Tab and Shift+Tab stay inside a modal dialog. Non-modal mode leaves outside content operable.
- Escape and outside press close when enabled and report distinct reasons.
- Closing restores focus to Trigger or an explicit final focus target.
- Controlled and uncontrolled open state support canceled transitions and open-change completion.
- Standard, wide, and fullscreen variants use the same parts and focus contract.
- Header and footer are composition slots. Form dialogs preserve native submission, validation, and reset.
- Long content scrolls inside the content region while header and footer may remain fixed.
- Nested dialogs and popovers keep layer order, dismissal, and focus ownership correct.
- Adaptive presentation may use Drawer on small screens only when the semantic role and focus contract remain unchanged.
- Entry is immediate. Backdrop and Popup never fade, scale, or slide in.
- Close may fade out for 100 ms. Focus and open state update without waiting for visual exit.
