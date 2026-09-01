# Popover behavior specification

- Popover presents non-modal rich content beside a Trigger.
- Root composes Trigger, Portal, Positioner, Popup, Arrow, Title, Description, and Close parts.
- Trigger exposes expanded state and popup ownership.
- Popup receives dialog semantics only when its content needs a named interactive region.
- Pointer or keyboard activation toggles the Popover.
- Escape, outside press, close control, and focus-out dismissal are independently configurable and report reasons.
- Focus moves inside only when the content workflow requires it. Otherwise Trigger retains focus.
- Closing restores focus according to the opening interaction and final-focus option.
- Controlled and uncontrolled open state permit canceled changes and completion callbacks.
- Nested popovers, menus, selects, and dialogs preserve the correct parent layer during child interaction and drag.
- Positioning supports side, alignment, offsets, arrows, collision, sticky behavior, anchors, and resize updates.
- Modal mode locks outside interaction. Non-modal mode leaves outside content available.
- Popup entry is immediate. It never fades, scales, or slides in.
- Closing uses the shared 100 ms fade-out without delaying focus or dismissal.
