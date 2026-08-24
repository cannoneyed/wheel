/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal, wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, createSignal, splitProps, type JSX } from 'solid-js';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { mergeRefs } from '../../base-utils/mergeRefs';
import { visuallyHidden, visuallyHiddenInput } from '../../base-utils/visuallyHidden';
import { ownerDocument } from '../../base-utils/owner';
import { addEventListener } from '../../base-utils/addEventListener';
import { platform } from '../../base-utils/platform/index';
import { activeElement } from '../../internals/shadowDom';
import { NumberFieldRootContext, type InputMode } from './NumberFieldRootContext';
import { useFieldRootContext, type FieldRootState } from '../../internals/field-root-context/FieldRootContext';
import { useFormContext } from '../../internals/form-context/FormContext';
import { useLabelableId } from '../../internals/labelable-provider/useLabelableId';
import type { BaseUIComponentProps } from '../../internals/types';
import { stateAttributesMapping } from '../utils/stateAttributesMapping';
import { renderElement } from '../../internals/renderElement';
import {
  getFormatParts,
  getNumberLocaleDetails,
  PERMILLE,
  PERCENTAGES,
  SPACE_SEPARATOR_RE,
  BASE_NON_NUMERIC_SYMBOLS,
  MINUS_SIGNS_WITH_ASCII,
  PLUS_SIGNS_WITH_ASCII,
} from '../utils/parse';
import { formatNumber } from '../../utils/formatNumber';
import { toValidatedNumber } from '../utils/validate';
import type { EventWithOptionalKeyState, IncrementValueParameters } from '../utils/types';
import {
  createChangeEventDetails,
  createGenericEventDetails,
  type BaseUIChangeEventDetails,
  type BaseUIGenericEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

/**
 * Groups all parts of the number field and manages its state.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Number Field](https://base-ui.com/react/components/number-field)
 *
 * Solid port of upstream's `NumberFieldRoot`. Notable deviations, all covered in
 * CONVENTIONS.md / NumberFieldRootContext.ts:
 * - React refs used only to dodge stale closures (`valueRef`, `formatOptionsRef`) collapse to
 *   plain accessors — Solid accessors are always live.
 * - `useForcedRerendering` is dropped: Solid's fine-grained reactivity re-renders whatever reads
 *   `inputValue()`/`value()` automatically; there's nothing to force.
 * - `suppressHydrationWarning` has no Solid equivalent and is omitted (no SSR hydration-mismatch
 *   concept in this port).
 */
export function NumberFieldRoot(componentProps: NumberFieldRoot.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'id',
    'min',
    'max',
    'smallStep',
    'step',
    'largeStep',
    'required',
    'disabled',
    'readOnly',
    'form',
    'name',
    'defaultValue',
    'value',
    'onValueChange',
    'onValueCommitted',
    'allowWheelScrub',
    'snapOnStep',
    'allowOutOfRange',
    'format',
    'locale',
    'inputRef',
    'class',
    'style',
    'as',
    'asChild',
    'children',
  ]);

  const smallStep = () => componentProps.smallStep ?? 0.1;
  const stepProp = () => componentProps.step ?? 1;
  const step = () => {
    const s = stepProp();
    return s === 'any' ? 1 : s;
  };
  const largeStep = () => componentProps.largeStep ?? 10;
  const required = () => componentProps.required ?? false;
  const disabledProp = () => componentProps.disabled ?? false;
  const readOnly = () => componentProps.readOnly ?? false;
  const allowWheelScrub = () => componentProps.allowWheelScrub ?? false;
  const snapOnStep = () => componentProps.snapOnStep ?? false;
  const allowOutOfRange = () => componentProps.allowOutOfRange ?? false;
  const format = () => componentProps.format;
  const locale = () => componentProps.locale;

  const { clearErrors } = useFormContext();
  const fieldContext = useFieldRootContext();
  const {
    setDirty,
    validityData,
    disabled: fieldDisabled,
    setFilled,
    invalid,
    name: fieldName,
    state: fieldState,
    validation,
  } = fieldContext;

  const disabled = () => (fieldDisabled() || disabledProp()) ?? false;
  const name = () => fieldName() ?? componentProps.name;

  const [isScrubbing, setIsScrubbing] = createSignal(false);

  const minWithDefault = () => componentProps.min ?? Number.MIN_SAFE_INTEGER;
  const maxWithDefault = () => componentProps.max ?? Number.MAX_SAFE_INTEGER;
  const minWithZeroDefault = () => componentProps.min ?? 0;

  const inputRef: { current: HTMLInputElement | null } = { current: null };
  let hiddenInputEl: HTMLInputElement | undefined;
  const hiddenInputRef = mergeRefs<HTMLInputElement>(
    (el) => {
      hiddenInputEl = el;
    },
    (el) => componentProps.inputRef?.(el),
    (el) => validation.registerInput(el),
  );

  const id = useLabelableId({ id: () => componentProps.id });

  const [valueUnwrapped, setValueUnwrapped] = createControllableSignal<number | null>({
    controlled: () => componentProps.value,
    default: componentProps.defaultValue ?? null,
    name: 'NumberField',
    state: 'value',
  });

  const value = () => valueUnwrapped() ?? null;
  // Mirrors upstream's `useValueAsRef(value)`: kept in sync reactively, but deliberately
  // writable out-of-band by `useNumberFieldButton`'s `commitValue` (see NumberFieldRootContext.ts).
  const valueRef: { current: number | null } = { current: value() };
  createEffect(() => {
    valueRef.current = value();
  });

  createEffect(() => {
    setFilled(value() !== null);
  });

  const hasPendingCommitRef: { current: boolean } = { current: false };

  const onValueCommitted = (
    nextValue: number | null,
    eventDetails: NumberFieldRoot.CommitEventDetails,
  ) => {
    hasPendingCommitRef.current = false;
    componentProps.onValueCommitted?.(nextValue, eventDetails);
  };

  const allowInputSyncRef: { current: boolean } = { current: true };
  const lastChangedValueRef: { current: number | null } = { current: null };

  const [inputValue, setInputValue] = createSignal(formatNumber(value(), locale(), format()));
  const [inputMode, setInputMode] = createSignal<InputMode>('numeric');

  function getAllowedNonNumericKeys(): Set<string> {
    const parts = getFormatParts(locale(), format());

    const keys = new Set<string>();
    BASE_NON_NUMERIC_SYMBOLS.forEach((symbol) => keys.add(symbol));

    // Integer formats omit the decimal from `parts`, so fall back to the locale's separator in that
    // case; it must stay typeable regardless of whether the format renders a fraction.
    const decimal =
      parts.find((part) => part.type === 'decimal')?.value ??
      getNumberLocaleDetails(locale(), format()).decimal;
    if (decimal) {
      keys.add(decimal);
    }

    // Allow every non-digit character the formatter renders — separators, currency symbols, units
    // (e.g. `km/h`, `°C`), exponent separators, and locale literals — decomposed per character
    // because the input validates the typed string one character at a time. Deriving these from
    // the formatter covers multi-character and locale-specific symbols of every part type
    // uniformly. `compact` suffixes (e.g. `K`/`M`) are excluded because `parseNumber` can't reverse
    // them, so allowing them would yield a silently incorrect value.
    parts.forEach((part) => {
      if (
        part.type === 'integer' ||
        part.type === 'fraction' ||
        part.type === 'exponentInteger' ||
        part.type === 'compact'
      ) {
        return;
      }
      Array.from(part.value).forEach((char) => keys.add(char));
      if (SPACE_SEPARATOR_RE.test(part.value)) {
        keys.add(' ');
      }
    });

    const formatStyle = format()?.style;
    const allowPercentSymbols =
      formatStyle === 'percent' || (formatStyle === 'unit' && format()?.unit === 'percent');
    const allowPermilleSymbols =
      formatStyle === 'percent' || (formatStyle === 'unit' && format()?.unit === 'permille');

    // Tolerate percent/permille variants the formatter doesn't emit but users may type or paste.
    if (allowPercentSymbols) {
      PERCENTAGES.forEach((key) => keys.add(key));
    }
    if (allowPermilleSymbols) {
      PERMILLE.forEach((key) => keys.add(key));
    }

    // Allow plus sign in all cases; minus sign when negatives are valid, or when out-of-range
    // entry is allowed so native underflow validation can be triggered from the keyboard.
    PLUS_SIGNS_WITH_ASCII.forEach((key) => keys.add(key));
    if (minWithDefault() < 0 || allowOutOfRange()) {
      MINUS_SIGNS_WITH_ASCII.forEach((key) => keys.add(key));
    }

    return keys;
  }

  function getStepAmount(event?: EventWithOptionalKeyState): number {
    if (event?.altKey) {
      return smallStep();
    }
    if (event?.shiftKey) {
      return largeStep();
    }
    return step();
  }

  function setValue(
    unvalidatedValue: number | null,
    details: NumberFieldRoot.ChangeEventDetails,
  ): boolean {
    const eventWithOptionalKeyState = details.event as EventWithOptionalKeyState;
    const dir = details.direction;

    // Direct text entry (typing, pasting, clearing, autofill) behaves natively; step-based
    // interactions (keyboard arrows, buttons, wheel, scrub) do not.
    const isInputReason =
      details.reason === REASONS.inputChange ||
      details.reason === REASONS.inputClear ||
      details.reason === REASONS.inputBlur ||
      details.reason === REASONS.inputPaste ||
      details.reason === REASONS.none;

    // Only allow out-of-range values for direct text entry. Step-based interactions still clamp.
    const shouldClampValue = !allowOutOfRange() || !isInputReason;

    const validatedValue = toValidatedNumber(unvalidatedValue, {
      step: dir ? getStepAmount(eventWithOptionalKeyState) * dir : undefined,
      format: format(),
      minWithDefault: minWithDefault(),
      maxWithDefault: maxWithDefault(),
      minWithZeroDefault: minWithZeroDefault(),
      snapOnStep: snapOnStep(),
      small: eventWithOptionalKeyState?.altKey ?? false,
      clamp: shouldClampValue,
    });

    // Notify about a change even when the numeric value is unchanged for input reasons: the
    // typed text may clamp/snap to the current value, or differ while validation normalizes
    // it back to the existing value.
    const shouldFireChange =
      validatedValue !== value() ||
      (isInputReason && (unvalidatedValue !== value() || allowInputSyncRef.current === false));

    if (shouldFireChange) {
      componentProps.onValueChange?.(validatedValue, details);

      if (details.isCanceled) {
        // Report a vetoed change as not applied, so callers don't commit a value never stored.
        return false;
      }

      setValueUnwrapped(validatedValue);
      setDirty(validatedValue !== validityData().initialValue);
      hasPendingCommitRef.current = true;
    }

    lastChangedValueRef.current = validatedValue;

    // Keep the visible input in sync immediately when programmatic changes occur
    // (increment/decrement, wheel, etc). During direct typing we don't want
    // to overwrite the user-provided text until blur, so we gate on
    // `allowInputSyncRef`.
    if (allowInputSyncRef.current) {
      setInputValue(formatNumber(validatedValue, locale(), format()));
    }

    return shouldFireChange;
  }

  function incrementValue(amount: number, params: IncrementValueParameters): boolean {
    const { direction, currentValue, event, reason } = params;
    const prevValue = currentValue == null ? valueRef.current : currentValue;
    // The generic `Event` on `IncrementValueParameters` is narrowed by each individual call site
    // (button press, wheel, scrub, keyboard) to the reason-appropriate event type; mirrors
    // upstream's own cast here.
    const nativeEvent = event as any;

    if (typeof prevValue !== 'number') {
      // Seed an empty field with 0; `setValue` clamps it to the in-range value nearest 0
      // (e.g. `max` for a negative range). No `direction`: the seed isn't a step, so it must
      // not be directionally snapped.
      return setValue(0, createChangeEventDetails(reason, nativeEvent));
    }

    return setValue(
      prevValue + amount * direction,
      createChangeEventDetails(reason, nativeEvent, undefined, {
        direction,
      }),
    );
  }

  // We need to update the input value when the external `value` prop changes. This ends up acting
  // as a single source of truth to update the input value, bypassing the need to manually set it in
  // each event handler.
  createEffect(function syncFormattedInputValueOnValueChange() {
    const nextInputValue = formatNumber(value(), locale(), format());

    // This ensures the value is only updated on blur rather than every keystroke, but still
    // allows the input value to be updated when the value is changed externally.
    if (!allowInputSyncRef.current) {
      return;
    }

    if (nextInputValue !== inputValue()) {
      setInputValue(nextInputValue);
    }
  });

  createEffect(function setDynamicInputModeForIOS() {
    if (!platform.os.ios) {
      return;
    }

    // iOS numeric software keyboard doesn't have a minus key, so we need to use the default
    // keyboard to let the user input a negative number.
    let computedInputMode: InputMode = 'text';

    if (minWithDefault() >= 0) {
      // iOS numeric software keyboard doesn't have a decimal key for "numeric" input mode, but
      // this is better than the "text" input if possible to use.
      computedInputMode = 'decimal';
    }

    setInputMode(computedInputMode);
  });

  // Deviation: the hidden `<input>`'s `value={value() ?? ''}` JSX binding above only ever sets
  // the DOM `.value` *property* (matching upstream's plain `value={value ?? ''}`, which itself
  // only sets React's controlled property). Per the HTML step-validation algorithm, though,
  // `stepMismatch`'s step base falls back to the `min` attribute, then the `value` *content
  // attribute* (the static HTML attribute, not the live property), then 0 — so a fractional
  // value with no explicit `min` and no `value` attribute is spuriously flagged as a step
  // mismatch. Keep the real attribute in sync by hand so that fallback step base reflects the
  // current value without requiring an explicit `min`.
  createEffect(function syncHiddenInputValueAttribute() {
    hiddenInputEl?.setAttribute('value', value() != null ? String(value()) : '');
  });

  // A native (non-passive) `wheel` listener is required to `preventDefault` and stop page
  // scrolling while wheel-scrubbing.
  createEffect(function registerElementWheelListener() {
    const element = inputRef.current;
    if (disabled() || readOnly() || !allowWheelScrub() || !element) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      if (
        // Allow pinch-zooming.
        event.ctrlKey ||
        activeElement(ownerDocument(inputRef.current)) !== inputRef.current
      ) {
        return;
      }

      // Prevent the default behavior to avoid scrolling the page.
      event.preventDefault();
      allowInputSyncRef.current = true;

      const amount = getStepAmount(event);

      // Each wheel turn is a discrete, final change, so commit it immediately like keyboard
      // steps (gated on an actual change so boundary no-ops don't commit).
      const changed = incrementValue(amount, {
        direction: event.deltaY > 0 ? -1 : 1,
        event,
        reason: REASONS.wheel,
      });
      if (changed) {
        onValueCommitted(
          lastChangedValueRef.current ?? valueRef.current,
          createGenericEventDetails(REASONS.wheel, event),
        );
      }
    }

    const unsubscribe = addEventListener(element, 'wheel', handleWheel);
    return unsubscribe;
  });

  const state: NumberFieldRoot.State = {
    get disabled() {
      return disabled();
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
    get inputValue() {
      return inputValue();
    },
    get scrubbing() {
      return isScrubbing();
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
      return fieldState.filled;
    },
    get focused() {
      return fieldState.focused;
    },
  };

  const contextValue: NumberFieldRootContext = {
    inputRef,
    inputValue,
    value,
    minWithDefault,
    maxWithDefault,
    disabled,
    readOnly,
    id,
    setValue,
    incrementValue,
    getStepAmount,
    allowInputSyncRef,
    format,
    valueRef,
    lastChangedValueRef,
    hasPendingCommitRef,
    name,
    nameProp: () => componentProps.name,
    required,
    invalid,
    inputMode,
    getAllowedNonNumericKeys,
    min: () => componentProps.min,
    max: () => componentProps.max,
    setInputValue,
    locale,
    isScrubbing,
    setIsScrubbing,
    state,
    onValueCommitted,
  };

  return (
    <NumberFieldRootContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-NumberField-Root',
        slot: 'number-field-root',
        state,
        props: elementProps as Record<string, any>,
        stateAttributesMapping,
      })}
      <input
        {...validation.getValidationProps(disabled(), {
          onFocus() {
            inputRef.current?.focus();
          },
          onChange(event: Event) {
            if (event.defaultPrevented || disabled() || readOnly()) {
              return;
            }

            // Handle browser autofill.
            const target = event.currentTarget as HTMLInputElement;
            const nextValue = target.valueAsNumber;
            const parsedValue = Number.isNaN(nextValue) ? null : nextValue;
            const details = createChangeEventDetails(REASONS.none, event);

            // `setValue` updates the dirty flag from the stored (clamped) value, so validate with
            // that same value rather than the raw autofilled one.
            setValue(parsedValue, details);
            clearErrors(name());
            validation.change(lastChangedValueRef.current ?? parsedValue);
          },
        })}
        ref={hiddenInputRef}
        type="number"
        form={componentProps.form}
        name={name()}
        value={value() ?? ''}
        min={componentProps.min}
        max={componentProps.max}
        step={stepProp() as number | string}
        disabled={disabled()}
        readOnly={readOnly()}
        required={required()}
        aria-hidden="true"
        tabIndex={-1}
        style={name() ? visuallyHiddenInput : visuallyHidden}
      />
    </NumberFieldRootContext.Provider>
  );
}

export interface NumberFieldRootState extends FieldRootState {
  /**
   * The raw numeric value of the field.
   */
  value: number | null;
  /**
   * The formatted string value presented in the input element.
   */
  inputValue: string;
  /**
   * Whether the user must enter a value before submitting a form.
   */
  required: boolean;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the user should be unable to change the field value.
   */
  readOnly: boolean;
  /**
   * Whether the user is currently scrubbing the field.
   */
  scrubbing: boolean;
}

export interface NumberFieldRootProps extends BaseUIComponentProps<'div', NumberFieldRootState> {
  /**
   * The id of the input element.
   */
  id?: string | undefined;
  /**
   * The minimum value of the input element.
   */
  min?: number | undefined;
  /**
   * The maximum value of the input element.
   */
  max?: number | undefined;
  /**
   * When true, direct text entry may be outside the `min`/`max` range without clamping,
   * so native range underflow/overflow validation can occur.
   * Step-based interactions (keyboard arrows, buttons, wheel, scrub) still clamp.
   * @default false
   */
  allowOutOfRange?: boolean | undefined;
  /**
   * The small step value of the input element when incrementing while the alt key is held.
   * Snaps to multiples of this value when `snapOnStep` is enabled.
   * @default 0.1
   */
  smallStep?: number | undefined;
  /**
   * Amount to increment and decrement with the buttons and arrow keys, or to scrub with pointer movement in the scrub area.
   * To always enable step validation on form submission, specify the `min` prop explicitly in conjunction with this prop.
   * Specify `step="any"` to always disable step validation; interactive stepping then uses a base amount of `1`, while the alt and shift keys still step by `smallStep` and `largeStep`.
   * @default 1
   */
  step?: number | 'any' | undefined;
  /**
   * The large step value of the input element when incrementing while the shift key is held.
   * Snaps to multiples of this value when `snapOnStep` is enabled.
   * @default 10
   */
  largeStep?: number | undefined;
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
   * Identifies the form that owns the hidden input.
   * Useful when the number field is rendered outside the form.
   */
  form?: string | undefined;
  /**
   * The raw numeric value of the field.
   */
  value?: number | null | undefined;
  /**
   * The uncontrolled value of the field when it's initially rendered.
   *
   * To render a controlled number field, use the `value` prop instead.
   */
  defaultValue?: number | undefined;
  /**
   * Whether to allow the user to scrub the input value with the mouse wheel while focused and
   * hovering over the input.
   * @default false
   */
  allowWheelScrub?: boolean | undefined;
  /**
   * Whether the value should snap to the nearest step when incrementing or decrementing.
   * @default false
   */
  snapOnStep?: boolean | undefined;
  /**
   * Options to format the input value.
   */
  format?: Intl.NumberFormatOptions | undefined;
  /**
   * Callback fired when the number value changes.
   *
   * The `eventDetails.reason` indicates what triggered the change:
   * - `'input-change'` for parseable typing or programmatic text updates
   * - `'input-clear'` when the field becomes empty
   * - `'input-blur'` when formatting (and clamping, if enabled) occurs on blur
   * - `'input-paste'` for paste interactions
   * - `'keyboard'` for arrow-key/Home/End stepping (typing digits uses `'input-change'`/`'input-clear'`)
   * - `'increment-press'` / `'decrement-press'` for button presses on the increment and decrement controls
   * - `'wheel'` for wheel-based scrubbing
   * - `'scrub'` for scrub area drags
   */
  onValueChange?:
    | ((value: number | null, eventDetails: NumberFieldRoot.ChangeEventDetails) => void)
    | undefined;
  /**
   * Callback function that is fired when the value is committed.
   * It runs later than `onValueChange`, when:
   * - The input is blurred after typing a value.
   * - The pointer is released after scrubbing or pressing the increment/decrement buttons.
   *
   * It runs simultaneously with `onValueChange` when interacting with the keyboard or the
   * mouse wheel.
   *
   * **Warning**: This is a generic event not a change event.
   */
  onValueCommitted?:
    | ((value: number | null, eventDetails: NumberFieldRoot.CommitEventDetails) => void)
    | undefined;
  /**
   * The locale of the input element.
   * Defaults to the user's runtime locale.
   */
  locale?: Intl.LocalesArgument | undefined;
  /**
   * A ref to access the hidden input element.
   */
  inputRef?: ((el: HTMLInputElement) => void) | undefined;
}

export type NumberFieldRootChangeEventReason =
  | typeof REASONS.inputChange
  | typeof REASONS.inputClear
  | typeof REASONS.inputBlur
  | typeof REASONS.inputPaste
  | typeof REASONS.keyboard
  | typeof REASONS.incrementPress
  | typeof REASONS.decrementPress
  | typeof REASONS.wheel
  | typeof REASONS.scrub
  | typeof REASONS.none;
export interface NumberFieldRootChangeEventCustomProperties {
  direction?: (-1 | 1) | undefined;
}
export type NumberFieldRootChangeEventDetails = BaseUIChangeEventDetails<
  NumberFieldRootChangeEventReason,
  NumberFieldRootChangeEventCustomProperties
>;

// `none` is kept for consistency with other components even though the number field never
// commits with it.
export type NumberFieldRootCommitEventReason =
  | typeof REASONS.inputBlur
  | typeof REASONS.inputClear
  | typeof REASONS.keyboard
  | typeof REASONS.incrementPress
  | typeof REASONS.decrementPress
  | typeof REASONS.wheel
  | typeof REASONS.scrub
  | typeof REASONS.none;
export type NumberFieldRootCommitEventDetails =
  BaseUIGenericEventDetails<NumberFieldRootCommitEventReason>;

export namespace NumberFieldRoot {
  export type State = NumberFieldRootState;
  export type Props = NumberFieldRootProps;
  export type ChangeEventReason = NumberFieldRootChangeEventReason;
  export type ChangeEventDetails = NumberFieldRootChangeEventDetails;
  export type CommitEventReason = NumberFieldRootCommitEventReason;
  export type CommitEventDetails = NumberFieldRootCommitEventDetails;
}
