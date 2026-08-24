/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, createSignal, onCleanup, untrack, type Accessor } from 'solid-js';
import { useFormContext } from '../form-context/FormContext';
import { getCombinedFieldValidityData } from '../../field/utils/getCombinedFieldValidityData';
import type { FieldControlRegistration, FieldValidityData } from '../field-root-context/FieldRootContext';

export interface UseFieldControlRegistrationParameters {
  commit: (value?: unknown, revalidate?: boolean) => Promise<void>;
  invalid: Accessor<boolean | undefined>;
  markedDirty: { current: boolean };
  /**
   * The `name` prop set directly on `<Field.Root>` (not the effective/fallback name).
   */
  name: Accessor<string | undefined>;
  setRegisteredFieldName: (name: string | undefined) => void;
  setRegisteredFieldId: (id: string | undefined) => void;
  setValidityData: (next: FieldValidityData | ((prev: FieldValidityData) => FieldValidityData)) => void;
  validityData: Accessor<FieldValidityData>;
}

/**
 * Manages the single active form-control registration for a `<Field.Root>`,
 * keeping the surrounding `<Form>`'s field registry in sync.
 * Solid port of upstream's `useFieldControlRegistration`.
 */
export function useFieldControlRegistration(
  params: UseFieldControlRegistrationParameters,
): readonly [() => void, (source: symbol, registration: FieldControlRegistration | undefined) => void] {
  const {
    commit,
    invalid,
    markedDirty,
    name,
    setRegisteredFieldName,
    setRegisteredFieldId,
    setValidityData,
    validityData,
  } = params;

  const { formRef } = useFormContext();

  let activeSource: symbol | null = null;
  const [registration, setRegistration] = createSignal<FieldControlRegistration | undefined>(
    undefined,
  );
  const fallbackControlRef: { current: HTMLElement | null } = { current: null };

  function getValueForForm(reg: FieldControlRegistration) {
    return reg.getValueForForm ? reg.getValueForForm() : reg.value();
  }

  function getRegistrationValue(reg: FieldControlRegistration) {
    const v = reg.value();
    return v === undefined ? getValueForForm(reg) : v;
  }

  function validate() {
    markedDirty.current = true;
    const reg = registration();

    if (!reg) {
      commit(validityData().value);
      return;
    }

    commit(getRegistrationValue(reg));
  }

  function refreshRegistration(reg: FieldControlRegistration | undefined) {
    if (!reg) {
      return;
    }

    const id = reg.id();
    if (!id) {
      return;
    }

    formRef.current.fields.set(id, {
      getValue: () => getValueForForm(reg),
      name: name() ?? reg.name(),
      controlRef: reg.controlRef ?? fallbackControlRef,
      validityData: getCombinedFieldValidityData(validityData(), invalid()),
      validate,
    });
  }

  function deleteRegistration(id?: string) {
    const targetId = id ?? registration()?.id();
    if (targetId) {
      formRef.current.fields.delete(targetId);
    }
  }

  function syncInitialValue(reg: FieldControlRegistration) {
    const initialValue = getRegistrationValue(reg);

    if (validityData().initialValue === null && initialValue !== null) {
      setValidityData((prev) => ({ ...prev, initialValue }));
    }
  }

  // Keeps the form registry entry's `name`/`controlRef`/`validityData` fresh whenever they
  // change independently of a new `register()` call (e.g. the field name or validity changes).
  createEffect(() => {
    refreshRegistration(registration());
  });

  onCleanup(() => {
    deleteRegistration();
  });

  // `register` is an imperative action (called from a ref-callback-like effect in
  // `registerFieldControl.ts`, keyed only on `enabled`), not something that should itself be
  // tracked. Without `untrack`, every signal this reads (and, critically, writes — e.g.
  // `setRegistration`) would be attributed as a dependency of whatever effect happens to be
  // calling it, and an effect that both reads and writes the same signal reruns itself forever.
  const register = (source: symbol, next: FieldControlRegistration | undefined) => {
    untrack(() => {
      if (!next) {
        if (activeSource === source) {
          activeSource = null;
          deleteRegistration();
          setRegistration(undefined);
          setRegisteredFieldName(undefined);
          setRegisteredFieldId(undefined);
        }
        return;
      }

      const previousId = registration()?.id();

      activeSource = source;

      if (!name()) {
        setRegisteredFieldName(next.name());
      }
      setRegisteredFieldId(next.id());

      if (previousId && previousId !== next.id()) {
        deleteRegistration(previousId);
      }

      syncInitialValue(next);
      setRegistration(next);
      // Refresh synchronously so the form registry is consistent immediately, without waiting
      // for the reactive effect above to flush.
      refreshRegistration(next);
    });
  };

  return [validate, register] as const;
}
