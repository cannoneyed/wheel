# Component library

Human page: [Component library](../docs/component-library.mdx). API: [`wheel/components`](api/components.md).

## Import forms

```tsx
import 'wheel/components/styles';
import { Button, Dialog } from 'wheel/components';
import { Tabs } from 'wheel/components/tabs';
```

The aggregate and deep entries resolve to the same family objects. Deep entries also expose each family's public part types.

## Families

| Group | Families |
| --- | --- |
| Controls | `Button`, `Checkbox`, `Radio`, `Switch`, `Toggle`, `ToggleGroup` |
| Inputs | `Autocomplete`, `CheckboxGroup`, `Combobox`, `Field`, `Fieldset`, `Form`, `Input`, `NumberField`, `OTPField`, `RadioGroup`, `Select`, `Slider` |
| Disclosure and navigation | `Accordion`, `Collapsible`, `ContextMenu`, `Menu`, `Menubar`, `NavigationMenu`, `Tabs`, `Toolbar` |
| Overlays | `AlertDialog`, `Dialog`, `Drawer`, `Popover`, `PreviewCard`, `Toast`, `Tooltip` |
| Display | `Avatar`, `Meter`, `Progress`, `ScrollArea`, `Separator` |

## Multi-part composition

Most compound families are namespace objects with `Root` and part components. Use the family-specific deep API inventory for the complete part and prop list.

## Stable selectors

- Each rendered part receives a `wheel-<Family>-<Part>` class.
- Each rendered part receives a lower-case `data-slot` value.
- An application `class` prop is added to the default class.
- Shared implementations retain their implementation family selectors. `Autocomplete` uses Combobox parts.

## Styling

`wheel/components/styles` provides optional recipes and `--wheel-component-*` tokens. It uses cascade layers so unlayered application CSS can override recipes without `!important`.

Set `data-theme="light"` or `data-theme="dark"` on a container. Override semantic tokens on `:root`, a theme container, or one component instance.

Use stable classes for family-specific rules and `data-slot` for application-wide part conventions.

## Source and verification

- [`packages/wheel/src/components/index.ts`](../../packages/wheel/src/components/index.ts) defines the aggregate families.
- [`packages/wheel/vite.config.ts`](../../packages/wheel/vite.config.ts) defines built deep entries.
- [`scripts/check-package.mjs`](../../scripts/check-package.mjs) verifies packed aggregate, deep, and style entries.
- [`packages/playground`](../../packages/playground) renders component fixtures and browser checks.
