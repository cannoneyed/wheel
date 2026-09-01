# Checkbox List specification

Checkbox List presents a labeled multi-value field as a dense set of Checkbox List Item rows.

## Contract

- Checkbox List renders a field container and one nested Checkbox Group.
- `label` is required, visible, and names the nested group.
- `description` renders below the label and joins the group `aria-describedby` value.
- `statusMessage` renders after the group and joins the group `aria-describedby` value.
- `value`, `defaultValue`, `onValueChange`, and `allValues` use the Checkbox Group selection contract.
- Direct children are Checkbox List Item rows with unique non-empty values.
- `compact`, `balanced`, and `spacious` densities set row height, row padding, and inter-row spacing. `compact` is the default.
- `vertical` orientation is the default. `horizontal` orientation wraps rows in DOM order.
- `hasDividers` adds separators between adjacent rows and never renders a trailing separator.
- `sm` and `md` set the inherited Checkbox size.
- `default`, `success`, `warning`, and `error` set the field, message, and Checkbox tone.
- The stable root is `wheel-CheckboxList` with `data-slot="checkbox-list"`.

## Selection and field state

- Clicking a row label or pressing Space on its Checkbox requests one value change.
- Repeated selection and clearing remain available after every committed change.
- `disabled` blocks every row and applies disabled styling to the field.
- `readOnly` preserves full-opacity values and focus while blocking every change.
- A controlled list changes only when its owner applies the requested value array.
- Error status sets `aria-invalid="true"` on the nested group.
- Status text uses a polite live region so a status update is announced without interrupting current speech.

## Composition

- Checkbox List owns field labeling, status placement, layout, and collection state.
- Checkbox List Item owns each selectable row and its Checkbox parts.
- Applications use Field and Checkbox Group directly when they need a different field or row structure.
- `class`, `style`, ref, ARIA attributes, and data attributes apply to the field container.
- Label, description, status, and item content accept renderable content.

## Visual behavior

- Compact rows target 28 pixels. Balanced rows target 36 pixels. Spacious rows target 44 pixels.
- Dividers use the shared hairline and border token.
- Hover and focus surfaces do not change row dimensions.
- Selection surfaces and white marks appear immediately. A removed checkmark follows the Checkbox exit-only transition.
- Reduced-motion mode removes the checkmark exit transition.
- Forced-color mode preserves the focused row and selected Checkbox.
- Long labels and descriptions wrap without pushing the Checkbox or end content out of alignment.
