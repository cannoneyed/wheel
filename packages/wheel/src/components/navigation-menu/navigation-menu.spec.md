# Navigation Menu behavior specification

- Navigation Menu groups primary site links and optional anchored detail panels.
- Root composes List, Item, Trigger, Content, Link, Indicator, Viewport, Arrow, Positioner, and Portal parts.
- Links remain native navigation links with current-page semantics when applicable.
- Trigger exposes expanded state and owns one Content panel.
- Pointer intent or keyboard activation opens Content without changing the current route.
- Arrow keys move between top-level items according to orientation and text direction.
- Enter and Space open a Trigger. Escape closes and returns focus. Tab moves through links in the open panel, then onward.
- Pointer movement between Trigger and Content does not close through the safe travel corridor.
- Switching Triggers reanchors Viewport and Content to the active item without jumping to a stale position.
- Collision and resize keep content inside its boundary and update the anchor.
- Mobile composition uses an explicit disclosure or menu pattern instead of hover behavior.
- Active-route and open-panel states remain visually distinct.
- Entry is immediate. Old content may fade out for 100 ms while new content appears without entry motion.
- Forced colors preserves links, current route, open Trigger, Indicator, and focus.
- Browser proof covers pointer intent, every key, route links, reanchoring, resize, collision, touch, RTL, and repeated use.
