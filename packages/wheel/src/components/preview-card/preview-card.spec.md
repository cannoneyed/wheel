# Preview Card behavior specification

- Preview Card shows supplemental content for a link or other non-destructive reference.
- Root composes Trigger, Portal, Positioner, Popup, and Arrow parts.
- Trigger remains a native link when navigation is available.
- Keyboard focus opens after the configured delay. Pointer hover opens after pointer intent is established.
- Pointer movement from Trigger to Popup keeps the card open through a safe corridor.
- Leaving both surfaces closes after the configured close delay.
- Touch activation follows the link and does not require hover-only content to understand the destination.
- Popup content is not a keyboard trap. Interactive workflows use Popover instead.
- Escape closes a keyboard-opened card and leaves focus on Trigger.
- Controlled and uncontrolled open state report interaction reasons.
- Positioning supports collision, side, alignment, offsets, arrows, and resize.
- Loading and error content preserve the same card bounds and accessible link.
- Entry is immediate after the intent delay. The delay is not a fade-in.
- Closing uses the shared 100 ms fade-out. Reduced motion removes the fade.
- Browser proof covers focus, pointer intent, safe corridor, touch, collision, link navigation, and repeated previews.
