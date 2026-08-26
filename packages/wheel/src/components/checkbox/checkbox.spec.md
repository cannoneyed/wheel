# Checkbox specification

Checkbox toggles one boolean value or exposes a mixed value controlled by its owner.

## Contract

- `Checkbox.Root` renders a focusable element with `role="checkbox"` and a hidden native checkbox input.
- `Checkbox.Indicator` renders only while the value is checked or indeterminate unless `keepMounted` is true.
- The Root exposes `aria-checked="false"`, `aria-checked="true"`, or `aria-checked="mixed"`.
- Every Checkbox has an accessible name from `aria-label`, `aria-labelledby`, `Field.Label`, or a native label.
- `checked` controls the boolean value. `defaultChecked` sets the initial uncontrolled value.
- `indeterminate` controls the mixed state. The owner clears `indeterminate` when a user action resolves the mixed value.
- `onCheckedChange` receives the requested boolean value and cancelable event details before uncontrolled state commits.
- Canceling the event details keeps the Root and hidden input at the current value.
- `sm` renders a 14-pixel control. `md` renders a 16-pixel control and is the default.
- `default`, `success`, `warning`, and `error` statuses set the control tone.
- The stable parts are `wheel-Checkbox-Root` and `wheel-Checkbox-Indicator` with matching `data-slot` values.
- Root state exposes `checked`, `indeterminate`, `disabled`, `readOnly`, `required`, `size`, `status`, and Field validity state to `class` and `style` functions.

## Activation and state

- Pointer activation and Space request one value change.
- Enter does not toggle the Checkbox. Inside a form, Enter activates the default submitter unless a key handler prevents the default action.
- `disabled` removes the Root from sequential focus, blocks value changes, and sets `aria-disabled` and `data-disabled`.
- `readOnly` keeps the Root focusable, blocks value changes, and sets `aria-readonly` and `data-readonly` without disabled opacity.
- `required` sets the native required state and `aria-required`.
- A controlled Checkbox changes only when its owner applies the requested value.
- A grouped Checkbox derives its checked value from the Checkbox Group value array.
- A grouped Checkbox inherits `disabled`, `readOnly`, `size`, and `status`. A direct Checkbox prop overrides inherited `size` or `status`.

## Forms and composition

- `name`, `value`, and `form` apply to the hidden native checkbox input.
- A checked Checkbox submits its `value`. An unchecked Checkbox submits no value unless `uncheckedValue` is set.
- `inputRef` receives the hidden native checkbox input.
- `as` and `asChild` replace the Root element without removing checkbox semantics or the hidden input.
- Root and Indicator forward refs, event handlers, ARIA attributes, and data attributes to their rendered elements.
- Indicator content remains caller-owned so applications can use icons, text, or another code-native mark.

## Visual behavior

- Checked and indeterminate values use a solid selected-control surface in every theme.
- Every checkmark and mixed mark on a selected-control surface is white. Default, success, warning, and error status never invert the mark to gray or black.
- Dark themes darken selected-control surfaces instead of switching them to a light surface with a dark mark.
- Hover, pressed, focus, validation, and value changes do not change control dimensions.
- Checked and indeterminate surfaces and indicators appear on the first rendered frame without a fade.
- A removed indicator fades out for 100 milliseconds while it remains mounted.
- Component CSS never styles `[data-starting-style]`. Stylelint rejects an entry-motion selector.
- Reduced-motion mode removes the exit transition.
- Forced-color mode uses system Highlight and HighlightText colors for the selected surface and mark.
- Logical layout supports right-to-left labels without changing Checkbox state or activation.

## Proof

- Unit tests cover controlled and uncontrolled values, mixed state, cancellation, disabled and read-only behavior, form data, sizes, statuses, and group inheritance.
- Browser tests cover pointer and Space activation, focus, labels, mixed state, and repeated toggles.
- Catalog fixtures show both sizes, all statuses, all values, disabled, read-only, and required states.
- Light, dark, and custom-theme screenshots cover the complete fixture.
