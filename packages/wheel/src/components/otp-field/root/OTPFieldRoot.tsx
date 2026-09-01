/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../core/local-state';
import { createEffect, Show, splitProps, untrack, type JSX } from 'solid-js';
import { warn } from '../../base-utils/warn';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { createValueChanged } from '../../base-utils/createValueChanged';
import { visuallyHidden, visuallyHiddenInput } from '../../base-utils/visuallyHidden';
import { ownerDocument } from '../../base-utils/owner';
import { contains } from '../../internals/shadowDom';
import { CompositeList } from '../../internals/composite/list/CompositeList';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import {
  useFieldRootContext,
  type FieldRootState,
} from '../../internals/field-root-context/FieldRootContext';
import { registerFieldControl } from '../../internals/field-register-control/registerFieldControl';
import { useFormContext } from '../../internals/form-context/FormContext';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { useAriaLabelledBy } from '../../internals/labelable-provider/useAriaLabelledBy';
import { useLabelableId } from '../../internals/labelable-provider/useLabelableId';
import {
  createChangeEventDetails,
  createGenericEventDetails,
  type BaseUIChangeEventDetails,
  type BaseUIGenericEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { OTPFieldRootContext, type OTPFieldRootContext as OTPFieldRootContextType } from './OTPFieldRootContext';
import { rootStateAttributesMapping } from '../utils/stateAttributesMapping';
import {
  getOTPValidationConfig,
  normalizeOTPValue,
  normalizeOTPValueWithDetails,
  type OTPValidationType,
} from '../utils/otp';

/**
 * Groups all OTP field parts and manages their state.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI OTP Field](https://base-ui.com/react/components/otp-field)
 */
export function OTPFieldRoot(componentProps: OTPFieldRoot.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'aria-describedby',
    'aria-labelledby',
    'id',
    'autoComplete',
    'defaultValue',
    'value',
    'onValueChange',
    'onValueComplete',
    'form',
    'length',
    'autoSubmit',
    'mask',
    'inputMode',
    'validationType',
    'normalizeValue',
    'disabled',
    'readOnly',
    'required',
    'name',
    'onValueInvalid',
  ]);

  const {
    setDirty,
    validityData,
    disabled: fieldDisabled,
    setFilled,
    invalid,
    name: fieldName,
    state: fieldState,
    validation,
    validationMode,
    setFocused,
    setTouched,
  } = useFieldRootContext();
  const { clearErrors } = useFormContext();
  const { getDescriptionProps, labelId } = useLabelableContext();

  const disabled = () => (fieldDisabled() || componentProps.disabled) ?? false;
  const name = () => fieldName() ?? componentProps.name;
  const autoComplete = () => componentProps.autoComplete ?? 'one-time-code';
  const autoSubmit = () => componentProps.autoSubmit ?? false;
  const mask = () => componentProps.mask ?? false;
  const validationType = (): OTPValidationType => componentProps.validationType ?? 'numeric';
  const readOnly = () => componentProps.readOnly ?? false;
  const required = () => componentProps.required ?? false;

  const [valueUnwrapped, setValueUnwrapped] = createControllableSignal<string>({
    controlled: () => componentProps.value,
    default: componentProps.defaultValue ?? '',
    name: 'OTPField',
    state: 'value',
  });

  let rootRef: HTMLDivElement | undefined;
  const inputRefs: Array<HTMLInputElement | null> = [];
  // Plain mutable fields (not signals): read/written imperatively from event handlers and the
  // `createValueChanged` callback below, mirroring upstream's `useRef` usage for these.
  let pendingFocus: { index: number; value: string } | null = null;
  let pendingCompleteValue: { value: string; eventDetails: OTPFieldRoot.CompleteEventDetails } | null =
    null;
  const firstInputRef: { current: HTMLInputElement | null } = {
    get current() {
      return inputRefs[0] ?? null;
    },
  };

  const id = useLabelableId({ id: () => componentProps.id });
  const ariaLabelledBy = useAriaLabelledBy(
    () => componentProps['aria-labelledby'],
    labelId,
    firstInputRef,
    () => true,
    id,
  );
  const inputAriaLabelledBy = () =>
    componentProps['aria-labelledby'] == null ? ariaLabelledBy() : undefined;
  const ariaDescribedBy = () =>
    mergeAriaIds(componentProps['aria-describedby'], getDescriptionProps({})['aria-describedby']);

  const validationConfig = () => getOTPValidationConfig(validationType());
  const pattern = () => validationConfig()?.slotPattern;
  const hiddenInputPattern = () => validationConfig()?.getRootPattern(componentProps.length);
  const inputMode = () => componentProps.inputMode ?? validationConfig()?.inputMode;
  const hasValidLength = () => Number.isInteger(componentProps.length) && componentProps.length > 0;

  const value = () =>
    normalizeOTPValue(
      valueUnwrapped(),
      componentProps.length,
      validationType(),
      componentProps.normalizeValue,
    );
  const filled = () => value() !== '';

  const [inputCount, setInputCount] = useSignal(0, 'inputCount');
  const [focusedIndex, setFocusedIndex] = useSignal(
    Math.min(untrack(value).length, componentProps.length - 1), 'focusedIndex');
  const [focused, setFocusedState] = useSignal(false, 'focused');

  const activeIndex = () =>
    focused()
      ? Math.min(focusedIndex(), Math.max(componentProps.length - 1, 0))
      : Math.min(value().length, componentProps.length - 1);

  createEffect(() => {
    setFilled(filled());
  });

  if (process.env.NODE_ENV !== 'production') {
    createEffect(() => {
      // Track `inputCount` so this effect reruns as slots register/unregister.
      inputCount();

      // Deviation from upstream: `<OTPField.Input>` slots register with the surrounding
      // `CompositeList` one at a time as each mounts (Solid propagates each registration's signal
      // write synchronously instead of batching a whole render's effects the way React settles
      // before running post-commit effects). Checking synchronously here would spuriously warn
      // about every intermediate slot count (1, 2, 3, ...) even for a correctly configured field
      // that ends up matching `length` once mounting settles. Deferring the actual check to a
      // microtask lets registration finish first, so it only ever reports the final, settled count.
      queueMicrotask(() => {
        const count = untrack(inputCount);
        const len = componentProps.length;

        if (!Number.isInteger(len) || len <= 0 || count === 0 || count === len) {
          return;
        }

        warn(
          `<OTPField.Root> \`length\` must match the number of rendered ` +
            `<OTPField.Input /> parts. Received \`length={${len}}\` but rendered ` +
            `${count} input${count === 1 ? '' : 's'}.`,
        );
      });
    });

    createEffect(() => {
      const len = componentProps.length;

      if (Number.isInteger(len) && len > 0) {
        return;
      }

      warn(
        `<OTPField.Root> \`length\` must be a positive integer. Received \`length={${String(len)}}\`.`,
      );
    });
  }

  registerFieldControl(firstInputRef, id, value, undefined, () => !disabled(), name);

  function focusInput(index: number) {
    const targetIndex = Math.min(Math.max(index, 0), Math.max(inputRefs.length - 1, 0));
    const target = inputRefs[targetIndex];
    target?.focus();
    target?.select();
  }

  function queueFocusInput(index: number, nextValue: string) {
    pendingFocus = { index, value: nextValue };
  }

  function requestSubmit() {
    let formElement =
      (validation.inputRef.current as HTMLInputElement | null)?.form ?? inputRefs[0]?.form ?? null;

    if (componentProps.form) {
      const associatedElement = ownerDocument(rootRef).getElementById(componentProps.form);
      if (associatedElement?.tagName === 'FORM') {
        formElement = associatedElement as HTMLFormElement;
      }
    }

    if (formElement && typeof formElement.requestSubmit === 'function') {
      formElement.requestSubmit();
    }
  }

  function completeValue(completedValue: string, eventDetails: OTPFieldRoot.CompleteEventDetails) {
    componentProps.onValueComplete?.(completedValue, eventDetails);

    if (autoSubmit()) {
      requestSubmit();
    }
  }

  createValueChanged(value, () => {
    clearErrors(name());
    setDirty(value() !== validityData().initialValue);

    validation.change(value());

    const focus = pendingFocus;

    if (focus != null) {
      pendingFocus = null;

      if (focus.value === value()) {
        focusInput(focus.index);
      }
    }

    const completion = pendingCompleteValue;

    if (completion != null) {
      pendingCompleteValue = null;

      if (completion.value === value()) {
        completeValue(value(), completion.eventDetails);
      }
    }
  });

  // Deviation from upstream: Solid signal writes propagate synchronously (unlike React, which
  // defers its state-driven effects until after the current event handler returns). Upstream
  // relies on that deferral — it sets `pendingFocusRef`/`pendingCompleteValueRef` synchronously
  // right after calling `setValue`, then reads them back later inside `useValueChanged`'s effect.
  // Here, `setValueUnwrapped` below would re-run `createValueChanged`'s effect *before* control
  // even returns to the caller, so `pendingCompleteValue` must be populated (and the caller's own
  // pending-focus bookkeeping run via `onBeforeCommit`) before that write, not after.
  function setValue(
    nextValue: string,
    details: OTPFieldRoot.ChangeEventDetails,
    onBeforeCommit?: (committedValue: string) => void,
  ): string | null {
    const normalizedValue = normalizeOTPValue(
      nextValue,
      componentProps.length,
      validationType(),
      componentProps.normalizeValue,
    );
    const completeEventDetails =
      normalizedValue.length === componentProps.length &&
      (value().length !== componentProps.length || details.reason === REASONS.inputPaste)
        ? getCompleteEventDetails(details)
        : null;

    if (normalizedValue === value()) {
      if (completeEventDetails != null) {
        completeValue(normalizedValue, completeEventDetails);
      }

      return null;
    }

    componentProps.onValueChange?.(normalizedValue, details);

    if (details.isCanceled) {
      return null;
    }

    if (completeEventDetails != null) {
      pendingCompleteValue = { value: normalizedValue, eventDetails: completeEventDetails };
    } else if (normalizedValue.length !== componentProps.length) {
      pendingCompleteValue = null;
    }

    onBeforeCommit?.(normalizedValue);
    setValueUnwrapped(normalizedValue);

    return normalizedValue;
  }

  function reportValueInvalid(invalidValue: string, details: OTPFieldRoot.InvalidEventDetails) {
    componentProps.onValueInvalid?.(invalidValue, details);
  }

  function handleInputFocus(index: number, event: FocusEvent) {
    if (index > value().length) {
      focusInput(Math.min(value().length, componentProps.length - 1));
      return;
    }

    setFocusedIndex(index);
    setFocusedState(true);
    setFocused(true);
    (event.currentTarget as HTMLInputElement).select();
  }

  function handleInputBlur(event: FocusEvent) {
    if (contains(rootRef, event.relatedTarget as Element | null)) {
      return;
    }

    setTouched(true);
    setFocusedState(false);
    setFocused(false);

    if (validationMode() === 'onBlur') {
      validation.commit(value());
    }
  }

  function getInputId(index: number) {
    if (id() == null) {
      return undefined;
    }

    return index === 0 ? id() : `${id()}-${index + 1}`;
  }

  const state: OTPFieldRoot.State = {
    get disabled() {
      return disabled();
    },
    get touched() {
      return fieldState.touched;
    },
    get dirty() {
      return fieldState.dirty;
    },
    get valid() {
      return fieldState.valid;
    },
    get filled() {
      return filled();
    },
    get focused() {
      return focused();
    },
    get complete() {
      return value().length === componentProps.length;
    },
    get length() {
      return componentProps.length;
    },
    get readOnly() {
      return readOnly();
    },
    get required() {
      return required();
    },
    get value() {
      return value();
    },
  };

  const contextValue: OTPFieldRootContextType = {
    activeIndex,
    autoComplete,
    disabled,
    form: () => componentProps.form,
    focusInput,
    queueFocusInput,
    getInputId,
    handleInputBlur,
    handleInputFocus,
    inputMode,
    inputAriaLabelledBy,
    invalid,
    length: () => componentProps.length,
    mask,
    pattern,
    reportValueInvalid,
    readOnly,
    required,
    normalizeValue: () => componentProps.normalizeValue,
    setValue,
    state,
    validationType,
    value,
  };

  const hiddenValidationProps = () => validation.getValidationProps(disabled(), {});

  return (
    <CompositeList elements={inputRefs} onMapChange={(newMap) => setInputCount(newMap.size)}>
      <OTPFieldRootContext.Provider value={contextValue}>
        {renderElement('div', componentProps, {
    defaultClass: 'wheel-OTPField-Root',
    slot: 'otp-field-root',
          ref: (el: HTMLDivElement) => {
            rootRef = el;
          },
          state,
          props: [
            () => ({
              role: 'group',
              'aria-describedby': ariaDescribedBy(),
              'aria-labelledby': ariaLabelledBy(),
            }),
            elementProps as Record<string, any>,
          ],
          stateAttributesMapping: rootStateAttributesMapping,
        })}
        <Show when={hasValidLength()}>
          <input
            ref={(el: HTMLInputElement | null) => {
              validation.inputRef.current = el;
            }}
            type="text"
            id={id() && name() == null ? `${id()}-hidden-input` : undefined}
            form={componentProps.form}
            name={name()}
            value={value()}
            autocomplete={autoComplete()}
            inputmode={inputMode()}
            minlength={componentProps.length}
            maxlength={componentProps.length}
            pattern={hiddenInputPattern()}
            disabled={disabled()}
            readOnly={readOnly()}
            required={required()}
            aria-hidden="true"
            aria-describedby={hiddenValidationProps()['aria-describedby']}
            aria-invalid={hiddenValidationProps()['aria-invalid']}
            tabIndex={-1}
            style={name() ? visuallyHiddenInput : visuallyHidden}
            onFocus={() => focusInput(0)}
            // `on:` opts this listener out of Solid's delegated dispatch, which otherwise skips
            // disabled elements entirely — see the matching comment in `OTPFieldInput`'s
            // `on:input`. Solid also doesn't re-sync a controlled `value` on every commit the way
            // React does, so a declined edit must be reverted explicitly below.
            on:input={(event: InputEvent) => {
              const target = event.currentTarget as HTMLInputElement;

              if (event.defaultPrevented || disabled() || readOnly()) {
                target.value = value();
                return;
              }

              const rawValue = target.value;
              const [normalizedValue, didRejectCharacters] = normalizeOTPValueWithDetails(
                rawValue,
                componentProps.length,
                validationType(),
                componentProps.normalizeValue,
              );

              if (didRejectCharacters) {
                reportValueInvalid(rawValue, createGenericEventDetails(REASONS.inputChange, event));
              }

              const committed = setValue(
                normalizedValue,
                createChangeEventDetails(REASONS.inputChange, event),
                (committedValue) => {
                  if (committedValue !== '') {
                    queueFocusInput(committedValue.length - 1, committedValue);
                  }
                },
              );

              // See the matching revert in `OTPFieldInput`'s `on:input`: a canceled/no-op
              // `setValue` leaves state untouched, but the native 'input' event already mutated
              // this DOM value for real.
              if (committed == null) {
                target.value = value();
              }
            }}
          />
        </Show>
      </OTPFieldRootContext.Provider>
    </CompositeList>
  );
}

function getCompleteEventDetails(details: OTPFieldRoot.ChangeEventDetails) {
  if (details.reason === REASONS.inputChange || details.reason === REASONS.inputPaste) {
    return createGenericEventDetails(details.reason, details.event);
  }

  return null;
}

function mergeAriaIds(...values: Array<string | undefined>) {
  const ids = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []);
  return ids.length > 0 ? Array.from(new Set(ids)).join(' ') : undefined;
}

export interface OTPFieldRootProps extends Omit<
  BaseUIComponentProps<'div', OTPFieldRootState>,
  'onChange' | 'value'
> {
  /**
   * The id of the first input element.
   * Subsequent inputs derive their ids from it (`{id}-2`, `{id}-3`, and so on).
   */
  id?: string | undefined;
  /**
   * The input autocomplete attribute. Applied to the first slot and hidden validation input.
   * @default 'one-time-code'
   */
  autoComplete?: string | undefined;
  /**
   * A string specifying the `form` element with which the hidden input is associated.
   * This string's value must match the id of a `form` element in the same document.
   */
  form?: string | undefined;
  /**
   * The number of OTP input slots.
   * Required so the root can clamp values, detect completion, and generate
   * consistent validation markup before all slots hydrate.
   */
  length: number;
  /**
   * Whether to submit the owning form when the OTP becomes complete.
   * @default false
   */
  autoSubmit?: boolean | undefined;
  /**
   * Whether the slot inputs should mask entered characters.
   * Pass `type` directly to individual `<OTPField.Input>` parts to use a custom
   * input type.
   * @default false
   */
  mask?: boolean | undefined;
  /**
   * The virtual keyboard hint applied to the slot inputs and hidden validation input.
   *
   * Built-in validation modes provide sensible defaults, but you can override them when needed.
   */
  inputMode?: JSX.IntrinsicElements['input']['inputMode'] | undefined;
  /**
   * The type of input validation to apply to the OTP value.
   * @default 'numeric'
   */
  validationType?: OTPFieldRoot.ValidationType | undefined;
  /**
   * Function that normalizes the OTP value after whitespace and `validationType` filtering.
   * It runs whenever OTP Field normalizes a value, including initial/default values, controlled
   * values, and user edits.
   *
   * The returned value is filtered by `validationType` again, then clamped to `length`.
   * It should be idempotent because OTP Field may normalize the same value more than once while
   * handling edits, storing state, and rendering controlled or uncontrolled values. Non-idempotent
   * normalizers can compound across those normalization passes. Characters rejected while
   * normalizing typed or pasted text are reported through `onValueInvalid`.
   */
  normalizeValue?: ((value: string) => string) | undefined;
  /**
   * Whether the user must enter a value before submitting a form.
   * @default false
   */
  required?: boolean | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Whether the user should be unable to change the field value.
   * @default false
   */
  readOnly?: boolean | undefined;
  /**
   * Identifies the field when a form is submitted.
   */
  name?: string | undefined;
  /**
   * The OTP value.
   */
  value?: string | undefined;
  /**
   * The uncontrolled OTP value when the component is initially rendered.
   */
  defaultValue?: string | undefined;
  /**
   * Callback fired when the OTP value changes.
   *
   * The `eventDetails.reason` indicates what triggered the change:
   * - `'input-change'` for typing or autofill
   * - `'input-clear'` when a character is removed by text input
   * - `'input-paste'` for paste interactions
   * - `'keyboard'` for keyboard interactions that change the value
   */
  onValueChange?:
    | ((value: string, eventDetails: OTPFieldRoot.ChangeEventDetails) => void)
    | undefined;
  /**
   * Callback fired when entered text contains characters that are rejected by validation or
   * normalization before the OTP value updates.
   *
   * The `value` argument is the attempted user-entered string before normalization.
   */
  onValueInvalid?:
    | ((value: string, eventDetails: OTPFieldRoot.InvalidEventDetails) => void)
    | undefined;
  /**
   * Callback function that is fired when the OTP value becomes complete, or when a complete value
   * is pasted while the OTP is already complete.
   *
   * When the value changes, it runs later than `onValueChange`, after the internal value update is
   * applied. If a complete pasted value matches the current value, `onValueChange` does not fire.
   *
   * If `autoSubmit` is enabled, it runs immediately before the owning form is submitted.
   */
  onValueComplete?:
    | ((value: string, eventDetails: OTPFieldRoot.CompleteEventDetails) => void)
    | undefined;
}

export interface OTPFieldRootState extends FieldRootState {
  /**
   * Whether all slots are filled.
   */
  complete: boolean;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * The number of OTP input slots.
   */
  length: number;
  /**
   * Whether the user should be unable to change the field value.
   */
  readOnly: boolean;
  /**
   * Whether the user must enter a value before submitting a form.
   */
  required: boolean;
  /**
   * The OTP value.
   */
  value: string;
}

export type OTPFieldRootChangeEventReason =
  | typeof REASONS.inputChange
  | typeof REASONS.inputClear
  | typeof REASONS.inputPaste
  | typeof REASONS.keyboard;
export type OTPFieldRootChangeEventDetails =
  BaseUIChangeEventDetails<OTPFieldRootChangeEventReason>;

export type OTPFieldRootInvalidEventReason = typeof REASONS.inputChange | typeof REASONS.inputPaste;
export type OTPFieldRootInvalidEventDetails =
  BaseUIGenericEventDetails<OTPFieldRootInvalidEventReason>;

export type OTPFieldRootCompleteEventReason = typeof REASONS.inputChange | typeof REASONS.inputPaste;
export type OTPFieldRootCompleteEventDetails =
  BaseUIGenericEventDetails<OTPFieldRootCompleteEventReason>;

export namespace OTPFieldRoot {
  export type State = OTPFieldRootState;
  export type Props = OTPFieldRootProps;
  export type ValidationType = OTPValidationType;
  export type ChangeEventReason = OTPFieldRootChangeEventReason;
  export type ChangeEventDetails = OTPFieldRootChangeEventDetails;
  export type InvalidEventReason = OTPFieldRootInvalidEventReason;
  export type InvalidEventDetails = OTPFieldRootInvalidEventDetails;
  export type CompleteEventReason = OTPFieldRootCompleteEventReason;
  export type CompleteEventDetails = OTPFieldRootCompleteEventDetails;
}
