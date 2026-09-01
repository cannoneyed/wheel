# Tooltip behavior specification

- Tooltip supplies a short text label or explanation for one Trigger.
- Root composes Trigger, Portal, Positioner, Popup, and Arrow parts under a shared Provider delay policy.
- Trigger retains its native semantics and accessible name. Tooltip supplements it and never becomes the only name for an unlabeled action.
- Keyboard focus opens after the configured initial delay. Pointer hover opens after intent delay.
- Moving within the Provider's delay group lets later Tooltips open without repeating the full delay.
- Pointer leave, blur, Escape, pointer down, and disabled Trigger close according to policy.
- Popup is not interactive and never receives focus. Interactive help uses Popover.
- Touch does not depend on hover. Essential information remains available elsewhere.
- Controlled and uncontrolled open state report reasons without breaking delay groups.
- Positioning supports side, alignment, offsets, arrows, collision, and resize.
- Tooltip text wraps at a readable maximum width and remains visible at high zoom.
- Entry is immediate after the intent delay. The delay never runs a fade-in.
- Closing uses the shared 100 ms fade-out. Reduced motion removes the fade.
- Forced colors preserves Popup boundary, text, Arrow, and Trigger focus.
