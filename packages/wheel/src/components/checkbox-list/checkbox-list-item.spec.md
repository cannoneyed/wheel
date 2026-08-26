# Checkbox List Item specification

Checkbox List Item composes one Checkbox with a primary label, supporting text, and passive end content.

## Contract

- Checkbox List Item renders a native label row around `Checkbox.Root` and `Checkbox.Indicator`.
- `label` is required, visible, and supplies the Checkbox accessible name.
- `description` renders below the label and joins the Checkbox `aria-describedby` value.
- `endContent` renders after the label area for passive metadata such as counts, shortcuts, or status text.
- Interactive actions do not belong in `endContent` because nested controls inside a label have conflicting activation behavior.
- `value` is required inside Checkbox List or Checkbox Group and identifies the row in the selected value array.
- Standalone use accepts `checked`, `defaultChecked`, `onCheckedChange`, and `indeterminate`.
- `disabled`, `readOnly`, `required`, `name`, `size`, and `status` pass to the composed Checkbox.
- Group `disabled`, `readOnly`, `size`, and `status` values apply when the item does not override them.
- The stable root is `wheel-CheckboxListItem` with `data-slot="checkbox-list-item"`.

## Activation and state

- Clicking the Checkbox, label, description, or passive end content requests one value change.
- Space on the focused Checkbox requests one value change.
- Enter follows the Checkbox form behavior and does not toggle the value.
- `disabled` blocks row and Checkbox activation and removes the Checkbox from sequential focus.
- `readOnly` blocks value changes while preserving focus and selected styling.
- Indeterminate state shows a mixed mark and exposes `aria-checked="mixed"`.
- A controlled standalone item changes only when its owner applies the requested value.

## Layout and content

- The row uses three columns: Checkbox, flexible content, and optional end content.
- Label and description wrap inside the flexible column.
- End content remains aligned to the row center.
- The checkmark and mixed mark use `currentColor`. Selected-control state resolves it to white for default and validation tones.
- Hover, focus, checked, disabled, and read-only styling do not change row dimensions.
- Selected surface and mark appear immediately. A removed mark may fade out with Checkbox Indicator.
- Logical columns support right-to-left content without changing DOM or focus order.

## Proof

- Unit tests cover accessible naming, descriptions, end content, standalone state, grouped state, mixed state, disabled, read-only, size, and status.
- Browser tests cover label click, Space activation, repeated toggles, focus, and group inheritance.
- Catalog fixtures show label-only, described, end-content, checked, mixed, disabled, read-only, and both-size rows.
- Light, dark, and custom-theme screenshots cover the complete fixture.
