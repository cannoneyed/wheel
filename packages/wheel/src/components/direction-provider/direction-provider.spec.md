# Direction Provider behavior specification

- Direction Provider supplies left-to-right or right-to-left direction to descendant Wheel components.
- Provider does not render an extra DOM element.
- An explicit `dir` value overrides inherited document direction for its subtree.
- Without an explicit value, components read the closest native `dir` or document direction.
- Nested providers override the outer value only inside their subtree.
- Direction changes update keyboard mapping, popup alignment, connected edges, icons, and horizontal motion immediately.
- Components with physical semantics, such as increment direction or media controls, do not mirror merely because text direction changes.
- Horizontal arrows in composite widgets follow direction. Vertical arrows do not change.
- Portal content retains the logical direction of its owning component even when mounted under document body.
- Server and client direction resolve to the same initial value to avoid hydration changes.
- Provider has no visual recipe or motion.
