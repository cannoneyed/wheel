/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { onCleanup, type Accessor } from 'solid-js';
import { EMPTY_OBJECT } from '../../base-utils/empty';
import { createTimeout } from '../../base-utils/createTimeout';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { mergeProps } from '../../merge-props/mergeProps';
import { DEFAULT_VALIDITY_STATE } from '../../internals/field-constants/constants';
import { useFormContext } from '../../internals/form-context/FormContext';
import { getCombinedFieldValidityData } from '../utils/getCombinedFieldValidityData';
import type { HTMLProps } from '../../internals/types';
import type { FieldValidityData, FieldRootState } from './FieldRoot';

const validityKeys = Object.keys(DEFAULT_VALIDITY_STATE) as Array<keyof ValidityState>;

function isOnlyValueMissing(state: Record<keyof ValidityState, boolean> | undefined) {
  if (!state || state.valid || !state.valueMissing) {
    return false;
  }

  let onlyValueMissing = false;

  for (const key of validityKeys) {
    if (key === 'valid') {
      continue;
    }
    if (key === 'valueMissing') {
      onlyValueMissing = state[key];
    } else if (state[key]) {
      onlyValueMissing = false;
    }
  }

  return onlyValueMissing;
}

/**
 * Picks the input whose native validity should represent a field that owns several inputs (such as a
 * checkbox group). Prefers the first enabled currently-invalid input, where "first" follows Set
 * insertion order (mount order), and otherwise returns the first enabled input. Disabled inputs are
 * skipped because they don't participate in native constraint validation.
 */
function findRepresentativeInput(inputs: Set<HTMLInputElement>): HTMLInputElement | null {
  let fallback: HTMLInputElement | null = null;
  for (const input of inputs) {
    if (input.disabled) {
      continue;
    }
    if (!input.validity.valid) {
      return input;
    }
    fallback ??= input;
  }
  return fallback;
}

function clearCustomValidity(element: HTMLInputElement, inputs: Set<HTMLInputElement>) {
  let didClearElement = false;

  for (const input of inputs) {
    input.setCustomValidity('');
    didClearElement ||= input === element;
  }

  if (!didClearElement) {
    element.setCustomValidity('');
  }
}

export interface UseFieldValidationParameters {
  setValidityData: (next: FieldValidityData | ((prev: FieldValidityData) => FieldValidityData)) => void;
  validate: (
    value: unknown,
    formValues: Record<string, unknown>,
  ) => string | string[] | null | Promise<string | string[] | null>;
  validityData: Accessor<FieldValidityData>;
  validationDebounceTime: Accessor<number>;
  invalid: Accessor<boolean | undefined>;
  markedDirty: { current: boolean };
  state: FieldRootState;
  shouldValidateOnChange: () => boolean;
  getRegisteredFieldId: () => string | undefined;
}

export interface UseFieldValidationReturnValue {
  getValidationProps: (disabled: boolean, props?: HTMLProps) => HTMLProps;
  inputRef: { current: HTMLInputElement | null };
  registerInput: (element: HTMLElement | null) => void;
  commit: (value?: unknown, revalidate?: boolean) => Promise<void>;
  change: (value: unknown) => void;
}

/**
 * Runs a field control's native + custom validation and keeps validity data (and the form's
 * registry of it) in sync. Solid port of upstream's `useFieldValidation`.
 */
export function useFieldValidation(
  params: UseFieldValidationParameters,
): UseFieldValidationReturnValue {
  const { formRef } = useFormContext();

  const {
    setValidityData,
    validate,
    validityData,
    validationDebounceTime,
    invalid,
    markedDirty,
    state,
    shouldValidateOnChange,
    getRegisteredFieldId,
  } = params;

  const { controlId, getDescriptionProps } = useLabelableContext();

  const timeout = createTimeout();
  const inputRef: { current: HTMLInputElement | null } = { current: null };
  const registeredInputs = new Set<HTMLInputElement>();
  let validationCommitId = 0;

  // Checkbox groups register several inputs against a single field. Track them so a `required`
  // checkbox can't be satisfied by another input in the group, matching native per-checkbox behavior.
  // Deviation: upstream's ref callback returns a cleanup function (React 19 ref cleanup). Solid ref
  // callbacks don't support that, so cleanup is registered directly via `onCleanup` instead — this
  // runs in the calling control's own reactive owner (the ref fires during that control's setup),
  // so it still unregisters the input when that control unmounts.
  function registerInput(element: HTMLElement | null) {
    if (!element) {
      return;
    }
    const input = element as HTMLInputElement;
    registeredInputs.add(input);
    onCleanup(() => {
      registeredInputs.delete(input);
    });
  }

  async function commit(value?: unknown, revalidate = false) {
    // A field can own several inputs (a checkbox group), but only the last-mounted one wins the
    // shared `inputRef`. Validate against the registry instead so every input counts; `inputRef` is
    // the fallback only when no registered input applies (none registered, or all disabled).
    const element = findRepresentativeInput(registeredInputs) ?? inputRef.current;
    if (!element) {
      return;
    }

    validationCommitId += 1;
    const currentCommitId = validationCommitId;

    function updateRegisteredFieldValidity(
      nextValidityData: FieldValidityData,
      externalInvalid: boolean | undefined = invalid(),
    ) {
      const fieldId = getRegisteredFieldId() ?? controlId();
      if (fieldId == null) {
        return;
      }

      const currentFieldData = formRef.current.fields.get(fieldId);
      if (!currentFieldData) {
        return;
      }

      const validityDataWithFormErrors = getCombinedFieldValidityData(
        nextValidityData,
        externalInvalid,
      );

      formRef.current.fields.set(fieldId, {
        ...currentFieldData,
        validityData: validityDataWithFormErrors,
      });
    }

    if (revalidate) {
      if (state.valid !== false) {
        return;
      }

      const currentNativeValidity = element.validity;

      if (!currentNativeValidity.valueMissing) {
        // The 'valueMissing' (required) condition has been resolved by the user typing.
        // Temporarily mark the field as valid for this onChange event.
        // Other native errors (e.g., typeMismatch) will be caught by full validation on blur or submit.
        const nextValidityData: FieldValidityData = {
          value,
          state: { ...DEFAULT_VALIDITY_STATE, valid: true },
          error: '',
          errors: [],
          initialValue: validityData().initialValue,
        };
        clearCustomValidity(element, registeredInputs);

        // The required value is now present; ignore stale external invalid state for this pass.
        updateRegisteredFieldValidity(nextValidityData, false);
        setValidityData(nextValidityData);
        return;
      }

      // Value is still missing, or other conditions apply.
      // Let's use a representation of current validity for isOnlyValueMissing.
      const currentNativeValidityObject = validityKeys.reduce(
        (acc, key) => {
          acc[key] = currentNativeValidity[key];
          return acc;
        },
        {} as Record<keyof ValidityState, boolean>,
      );

      // If it's (still) natively invalid due to something other than just valueMissing,
      // then bail from this revalidation on change to avoid "scolding" for other errors.
      if (!currentNativeValidityObject.valid && !isOnlyValueMissing(currentNativeValidityObject)) {
        return;
      }

      // If valueMissing is still true AND it's the only issue, or if the field is now natively valid,
      // let it fall through to the main validation logic below.
    }

    function getState(el: HTMLInputElement) {
      const computedState = validityKeys.reduce(
        (acc, key) => {
          acc[key] = el.validity[key];
          return acc;
        },
        {} as Record<keyof ValidityState, boolean>,
      );

      let hasOnlyValueMissingError = false;

      for (const key of validityKeys) {
        if (key === 'valid') {
          continue;
        }
        if (key === 'valueMissing' && computedState[key]) {
          hasOnlyValueMissingError = true;
        } else if (computedState[key]) {
          return computedState;
        }
      }

      // Only make `valueMissing` mark the field invalid if it's been changed
      // to reduce error noise.
      if (hasOnlyValueMissingError && !markedDirty.current) {
        computedState.valid = true;
        computedState.valueMissing = false;
      }
      return computedState;
    }

    timeout.clear();

    let result: null | string | string[] = null;
    let validationErrors: string[] = [];

    const nextState = getState(element);

    let defaultValidationMessage: string | undefined;
    const isValidatingOnChange = shouldValidateOnChange();

    if (element.validationMessage && !isValidatingOnChange) {
      // not validating on change, if there is a `validationMessage` from
      // native validity, set errors and skip calling the custom validate fn
      defaultValidationMessage = element.validationMessage;
      validationErrors = [element.validationMessage];
    } else {
      // call the validate function because either
      // - validating on change, or
      // - native constraint validations passed, custom validity check is next
      const formValues = Array.from(formRef.current.fields.values()).reduce(
        (acc, field) => {
          if (field.name) {
            acc[field.name] = field.getValue();
          }
          return acc;
        },
        {} as Record<string, unknown>,
      );

      const resultOrPromise = validate(value, formValues);
      if (
        typeof resultOrPromise === 'object' &&
        resultOrPromise !== null &&
        'then' in resultOrPromise
      ) {
        result = await resultOrPromise;
        if (currentCommitId !== validationCommitId) {
          return;
        }
      } else {
        result = resultOrPromise;
      }

      if (result !== null) {
        nextState.valid = false;
        nextState.customError = true;

        if (Array.isArray(result)) {
          validationErrors = result;
          element.setCustomValidity(result.join('\n'));
        } else if (result) {
          validationErrors = [result];
          element.setCustomValidity(result);
        }
      } else if (isValidatingOnChange) {
        // validate function returned no errors, if validating on change
        // we need to clear the custom validity state
        clearCustomValidity(element, registeredInputs);
        nextState.customError = false;

        if (element.validationMessage) {
          defaultValidationMessage = element.validationMessage;
          validationErrors = [element.validationMessage];
        } else if (element.validity.valid && !nextState.valid) {
          nextState.valid = true;
        }
      }
    }

    const nextValidityData: FieldValidityData = {
      value,
      state: nextState,
      error: defaultValidationMessage ?? (Array.isArray(result) ? result[0] : (result ?? '')),
      errors: validationErrors,
      initialValue: validityData().initialValue,
    };

    // Keep Form-level errors part of overall field validity for submit blocking/focus logic.
    updateRegisteredFieldValidity(nextValidityData);

    setValidityData(nextValidityData);
  }

  function change(value: unknown) {
    timeout.clear();
    const validateOnChange = shouldValidateOnChange();

    if (validateOnChange && value !== '' && validationDebounceTime()) {
      validationCommitId += 1;
      timeout.start(validationDebounceTime(), () => {
        commit(value);
      });
    } else {
      commit(value, !validateOnChange);
    }
  }

  function getValidationProps(disabled: boolean, externalProps: HTMLProps = EMPTY_OBJECT): HTMLProps {
    return mergeProps(
      getDescriptionProps(externalProps),
      state.valid === false && !state.disabled && !disabled ? { 'aria-invalid': true } : EMPTY_OBJECT,
    );
  }

  return {
    getValidationProps,
    inputRef,
    registerInput,
    commit,
    change,
  };
}
