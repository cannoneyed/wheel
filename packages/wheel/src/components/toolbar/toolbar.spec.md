# Toolbar behavior specification

- Toolbar groups a compact set of related controls under one keyboard navigation scope.
- Root exposes toolbar semantics and has an accessible name when more than one toolbar is present.
- Button, Link, Input, and Separator parts remain native controls with Toolbar coordination layered on top.
- One enabled toolbar control is the sequential tab stop. Arrow keys move focus among enabled controls.
- `Home` and `End` move to the first and last enabled control. Looping is explicit.
- Horizontal and vertical orientation map arrow keys accordingly. Horizontal keys follow text direction.
- Inputs consume editing keys and do not trigger toolbar movement while text editing needs them.
- Disabled controls remain skipped. Disabled Toolbar blocks all child actions without hiding state.
- `sm`, `md`, and `lg` set shared control height and gaps.
- Connected and separated layout treatments do not change focus order or grouping.
- Nested menus, popovers, and selects return focus to their owning Toolbar control.
- Toolbar appears immediately and has no container motion.
- Forced colors preserves group boundaries, separators, selected toggles, and focus rings.
- Browser proof covers mixed controls, editing exceptions, RTL, orientation, nested popups, and dynamic insertion.
