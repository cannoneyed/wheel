# Drawer behavior specification

- Drawer presents focused content from a viewport edge and may be modal or non-modal.
- Root composes Trigger, Portal, Backdrop, Viewport, Popup, Content, Title, Description, Close, and swipe parts.
- Top, right, bottom, and left sides use matching geometry, swipe direction, collision, and text-direction rules.
- Opening moves focus inside. Modal mode traps focus and locks outside scroll.
- Escape, backdrop, close controls, and permitted outside presses report distinct close reasons.
- Closing restores focus to Trigger or an explicit final target.
- Pointer or touch swipe begins only from an allowed handle or surface and captures the active pointer.
- Swipe velocity and distance determine dismissal. A canceled swipe returns to the open position.
- Nested scroll content consumes gestures until it reaches the relevant edge.
- Controlled and uncontrolled open state remain authoritative throughout swipe preview.
- Standard, narrow, and wide sizes share the same focus and dismissal contract.
- Indent changes the visual viewport edge without changing hit targets or accessible bounds.
- Entry is immediate at the final open position. Drawer never slides in.
- Close and swipe dismissal may slide and fade out with shared exit tokens.
- Reduced motion dismisses immediately. Forced colors preserves Backdrop boundary, handle, and focus.
