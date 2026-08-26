# Radio behavior specification

- Radio represents one option inside a Radio Group.
- Root renders radio semantics and Indicator reflects checked state.
- A standalone Radio requires its own accessible name and boolean checked owner.
- Inside Radio Group, each Radio has a unique value and inherits group name, disabled, read-only, required, size, and status.
- Pointer activation checks an enabled option. A checked option does not uncheck itself.
- `Space` checks the focused option. Arrow behavior belongs to Radio Group.
- Disabled Radio remains readable, cannot receive a value, and leaves form submission unchanged.
- Read-only Radio remains focusable but cannot change the group value.
- `sm` and `md` sizes keep outer control, dot, and label alignment consistent.
- Neutral, success, warning, and error status preserve a visible selected dot in light, dark, and forced-color themes.
- Indicator appears immediately when selected and never fades in.
- Form submission emits the checked option value once under the group name.
- Browser proof covers pointer and Space selection, constraints, group inheritance, form reset, and visible contrast.
