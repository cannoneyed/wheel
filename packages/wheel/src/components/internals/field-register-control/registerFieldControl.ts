import { createEffect, onCleanup, type Accessor } from 'solid-js';
import { useFieldRootContext } from '../field-root-context/FieldRootContext';

/**
 * Registers a form control with the surrounding Field so the field can read
 * its value and validate it. No-op outside a Field.
 * Solid port of upstream's `useRegisterFieldControl`.
 *
 * Registration/unregistration is driven by an effect keyed on `enabled` (and
 * the accessors are handed to the field as-is, so it observes `id`/`value`/
 * `name` changes reactively without this effect needing to re-run for them).
 */
export function registerFieldControl(
  controlRef: { current: HTMLElement | null },
  id: Accessor<string | undefined>,
  value: Accessor<unknown>,
  getValueForForm: (() => unknown) | undefined,
  enabled: Accessor<boolean>,
  name: Accessor<string | undefined>,
) {
  const { registerFieldControl: register } = useFieldRootContext();
  const source = Symbol('field-control');

  createEffect(() => {
    if (!enabled()) {
      return;
    }

    register(source, { controlRef, id, value, getValueForForm, enabled, name });

    onCleanup(() => {
      register(source, undefined);
    });
  });
}
