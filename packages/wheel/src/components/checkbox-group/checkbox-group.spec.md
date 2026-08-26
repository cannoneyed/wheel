# Checkbox Group specification

Checkbox Group owns the selected string values for related Checkbox controls.

## Contract

- Checkbox Group renders one element with `role="group"`.
- `value` controls the selected string array. `defaultValue` sets the initial uncontrolled array.
- Each direct Checkbox uses a non-empty `value` as its collection identity.
- `onValueChange` receives the next array and cancelable event details before uncontrolled state commits.
- Canceling the event details keeps every child at the current group value.
- New selections append in activation order. Clearing a selection removes only that value.
- `vertical` orientation is the default. `horizontal` orientation wraps direct members in DOM order.
- `compact`, `balanced`, and `spacious` densities set 4, 8, and 12 pixels between direct members. `compact` is the default.
- `sm` and `md` set the default child Checkbox size. `md` is the default.
- `default`, `success`, `warning`, and `error` set the default child status. `default` is the default.
- Group state exposes `disabled`, `readOnly`, `orientation`, `density`, `size`, `status`, and Field validity state.

## Selection and focus

- Every enabled Checkbox remains a separate Tab stop. Checkbox Group does not add roving focus.
- Pointer activation and Space update only the activated value unless a parent Checkbox is used.
- `disabled` blocks every child and sets `data-disabled` on the group.
- `readOnly` blocks every child value change while preserving focus and selected styling.
- A direct child may override inherited `size` or `status`.
- A controlled group changes only when its owner applies the requested array.
- Child and group callbacks run once for each requested change.

## Parent Checkbox

- `allValues` enables parent and child tri-state coordination.
- A Checkbox with `parent` checks every enabled value when none or some are selected.
- A checked parent clears every enabled value.
- The parent exposes `aria-checked="mixed"` when some enabled values are selected.
- The parent `aria-controls` references every value declared by `allValues`.
- Disabled children retain their current value. An unavailable unchecked value keeps the parent mixed after every enabled value is selected.
- A parent Checkbox does not submit a form value.

## Naming, forms, and composition

- Every group has an accessible name from `aria-label`, `aria-labelledby`, or `Field.Label`.
- `aria-readonly` reflects group read-only state.
- Error status sets `aria-invalid="true"`.
- Child hidden inputs keep their own `name`, `value`, `form`, and required behavior.
- `as` and `asChild` replace the group element without changing context or selection state.
- `class` and `style` accept group state functions.

## Visual behavior

- Checkbox Group adds layout and spacing without its own surface, border, or background.
- Orientation and density changes do not reorder children.
- Selection surfaces and marks enter immediately. Child Indicator exit follows the Checkbox exit-only motion rule.
- Every selected child uses the white selected-control foreground for default and validation tones.
- Reduced-motion and forced-color behavior come from each child Checkbox.
- Logical layout supports right-to-left content.

## Proof

- Unit tests cover controlled and uncontrolled arrays, cancellation, inheritance, density, orientation, disabled, read-only, and parent behavior.
- Browser tests cover repeated selection, Space activation, individual Tab stops, horizontal wrapping, and parent mixed state.
- Catalog fixtures show all densities, both orientations, inherited sizes and statuses, disabled, read-only, and parent states.
- Light, dark, and custom-theme screenshots cover the complete fixture.
