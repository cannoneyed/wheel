# Icon Button specification

Icon Button exposes one compact action through an icon and a required accessible label.

## Contract

- `IconButton` requires `label` and `icon` props.
- `label` becomes `aria-label` and does not render as visible text.
- `icon` renders once, remains centered, and stays hidden from assistive technology by default.
- The stable identity is `wheel-IconButton` with `data-slot="icon-button"`.
- `IconButton` supports the same `primary`, `secondary`, `ghost`, and `destructive` variants as `Button`.
- `IconButton` supports the same `sm`, `md`, and `lg` sizes as `Button`.
- The control stays square at every size.
- `data-variant`, `data-size`, `data-loading`, and `data-disabled` match the Button contract.
- `class` and `style` accept the same state functions as `Button`.

## Behavior and composition

- Pointer, keyboard, link, form, disabled, loading, async, and interruptible behavior matches `Button`.
- Loading replaces the icon visually without changing the square dimensions or accessible name.
- `IconButton` inherits Button Group size, variant, disabled state, connected edges, and roving focus.
- Consumers pair unfamiliar icons with `Tooltip`; the required label still names the control without a tooltip.
- The icon cannot be the only accessible content because its visual shape may have no stable text alternative.
- `ref`, event handlers, ARIA attributes, data attributes, and link attributes reach the rendered element.

## Visual behavior

- Icon dimensions scale from 14 pixels at `sm`, to 16 pixels at `md`, to 18 pixels at `lg`.
- Hover and pressed states enter immediately and use the Button fast exit transition.
- Focus remains visible without changing the square dimensions.
- Forced-color and reduced-motion behavior matches `Button`.
