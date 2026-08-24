/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, splitProps, type JSX } from 'solid-js';
import { warn } from '../../base-utils/warn';
import { createValueChanged } from '../../base-utils/createValueChanged';
import { stopEvent } from '../../internals/composite/composite';
import { useNumberFieldRootContext } from '../root/NumberFieldRootContext';
import type { BaseUIComponentProps } from '../../internals/types';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { registerFieldControl } from '../../internals/field-register-control/registerFieldControl';
import { useFormContext } from '../../internals/form-context/FormContext';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import {
  getNumberLocaleDetails,
  isNumeralChar,
  parseNumber,
  ANY_MINUS_RE,
  ANY_PLUS_RE,
  ANY_MINUS_DETECT_RE,
  ANY_PLUS_DETECT_RE,
  FORMAT_CONTROL_DETECT_RE,
} from '../utils/parse';
import type { NumberFieldRootState } from '../root/NumberFieldRoot';
import { stateAttributesMapping } from '../utils/stateAttributesMapping';
import { renderElement } from '../../internals/renderElement';
import {
  createChangeEventDetails,
  createGenericEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { formatNumber } from '../../utils/formatNumber';
import { REASONS } from '../../internals/reasons';
import { hasNumberFormatRoundingOptions, removeFloatingPointErrors } from '../utils/validate';

const NAVIGATE_KEYS = new Set([
  'Backspace',
  'Delete',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
  'Enter',
  'Escape',
]);

/**
 * The native input control in the number field.
 * Renders an `<input>` element.
 *
 * Documentation: [Base UI Number Field](https://base-ui.com/react/components/number-field)
 *
 * Deviation: upstream reads clipboard text through a `try`/`catch` guarded by React's
 * `SafeReact.captureOwnerStack` for the dev warning; `SafeReact` is a React-only shim
 * (CONVENTIONS.md: "what not to port"), so the warning here omits the owner stack.
 *
 * Deviation: upstream's `onChange` handler relies on React backing `onChange` with the native
 * `input` event for text-like elements, so it fires on every keystroke. A native DOM `change`
 * event (what Solid's `onChange` JSX prop actually binds to) only fires on commit
 * (blur/Enter), so this binds to `onInput` instead — the same fix already applied in
 * `field/control/FieldControl.tsx`. Getting this wrong doesn't just miss updates: the per-key
 * validation logic in `onKeyDown` below reads the `inputValue` signal to detect an
 * already-typed decimal/sign/currency symbol, and a stale signal (never advanced by keystrokes)
 * can make it wrongly reject a legitimate character.
 */
export function NumberFieldInput(componentProps: NumberFieldInput.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const context = useNumberFieldRootContext();
  const {
    allowInputSyncRef,
    disabled,
    format,
    getAllowedNonNumericKeys,
    getStepAmount,
    id,
    incrementValue,
    inputMode,
    inputValue,
    max,
    min,
    name,
    nameProp,
    readOnly,
    required,
    setValue,
    state,
    setInputValue,
    locale,
    inputRef,
    value,
    valueRef,
    onValueCommitted,
    lastChangedValueRef,
    hasPendingCommitRef,
  } = context;

  const { clearErrors } = useFormContext();
  const { validationMode, setTouched, setFocused, invalid, shouldValidateOnChange, validation } =
    useFieldRootContext();
  const { labelId } = useLabelableContext();

  let hasTouchedInput = false;
  let blockRevalidation = false;
  const pendingCaretRef: { current: number | null } = { current: null };

  registerFieldControl(inputRef, id, value, undefined, () => !disabled(), nameProp);

  // After a paste splices text into the controlled value, the browser would otherwise drop the
  // caret at the end of the new value. Restore it just after the inserted text.
  createEffect(() => {
    // Track `inputValue()` so this reruns exactly when the input's displayed text (and thus its
    // DOM `value`) has just been updated — the caret can only be restored after that happens.
    inputValue();
    if (pendingCaretRef.current != null) {
      const caret = pendingCaretRef.current;
      pendingCaretRef.current = null;
      inputRef.current?.setSelectionRange(caret, caret);
    }
  });

  createValueChanged(value, () => {
    clearErrors(name());

    if (blockRevalidation && !shouldValidateOnChange()) {
      blockRevalidation = false;
      return;
    }

    validation.change(value());
  });

  const inputProps = {
    get id() {
      return id();
    },
    get required() {
      return required();
    },
    get disabled() {
      return disabled();
    },
    get readOnly() {
      return readOnly();
    },
    get inputMode() {
      return inputMode();
    },
    get value() {
      return inputValue();
    },
    type: 'text',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: false,
    'aria-roledescription': 'Number field',
    get 'aria-invalid'() {
      return !disabled() && invalid() ? true : undefined;
    },
    get 'aria-labelledby'() {
      return labelId();
    },
    onFocus(event: FocusEvent) {
      // Read-only inputs are still focusable; only the value-changing handlers stay gated on it.
      if (event.defaultPrevented || disabled()) {
        return;
      }

      setFocused(true);

      if (hasTouchedInput) {
        return;
      }

      hasTouchedInput = true;

      // Browsers set selection at the start of the input field by default. We want to set it at
      // the end for the first focus.
      const target = event.currentTarget as HTMLInputElement;
      const length = target.value.length;
      target.setSelectionRange(length, length);
    },
    onBlur(event: FocusEvent) {
      if (event.defaultPrevented || disabled()) {
        return;
      }

      setTouched(true);
      setFocused(false);

      if (readOnly()) {
        return;
      }

      const hadManualInput = !allowInputSyncRef.current;
      const hadPendingProgrammaticChange = hasPendingCommitRef.current;

      allowInputSyncRef.current = true;

      if (inputValue().trim() === '') {
        const clearDetails = createChangeEventDetails(REASONS.inputClear, event);
        setValue(null, clearDetails);
        // Respect a canceled clear, mirroring the non-empty blur path below.
        if (clearDetails.isCanceled) {
          return;
        }
        if (validationMode() === 'onBlur') {
          validation.commit(null);
        }
        // Don't report a commit when blurring an already-empty field that the user never
        // interacted with: nothing was cleared and no programmatic change is pending.
        if (hadManualInput || hadPendingProgrammaticChange || value() !== null) {
          onValueCommitted(null, createGenericEventDetails(REASONS.inputClear, event));
        }
        return;
      }

      const formatOptions = format();
      const parsedValue = parseNumber(inputValue(), locale(), formatOptions);
      if (parsedValue === null) {
        return;
      }

      // Avoid applying Intl's default precision unless the format opts into rounding.
      const hasRoundingOptions = hasNumberFormatRoundingOptions(formatOptions);

      let committed: number | null;
      if (!hadManualInput && !hasRoundingOptions) {
        // No rounding options and no manual edit: the visible text is purely formatted
        // display, so keep the authoritative numeric value as-is rather than re-parsing the
        // rounded text and discarding precision (e.g. focus/blur with no edits, or blur after
        // a programmatic change).
        committed = value();
      } else if (hasRoundingOptions) {
        // Explicit rounding options apply to the committed value, whether typed or external.
        committed = removeFloatingPointErrors(parsedValue, formatOptions);
      } else {
        committed = parsedValue;
      }

      const nextEventDetails = createGenericEventDetails(REASONS.inputBlur, event);
      const shouldUpdateValue = value() !== committed;
      const shouldCommit = hadManualInput || shouldUpdateValue || hadPendingProgrammaticChange;

      // Use the stored value after `setValue` clamps it.
      let committedValue = committed;
      if (shouldUpdateValue) {
        const changeDetails = createChangeEventDetails(REASONS.inputBlur, event);
        blockRevalidation = true;
        setValue(committed, changeDetails);
        if (changeDetails.isCanceled) {
          blockRevalidation = false;
          return;
        }
        committedValue = lastChangedValueRef.current ?? committed;
        // If validation normalized back to the current value, `createValueChanged` won't fire to
        // reset the flag, so reset it here or the next external change won't revalidate.
        if (committedValue === value()) {
          blockRevalidation = false;
        }
      }
      if (validationMode() === 'onBlur') {
        validation.commit(committedValue);
      }
      if (shouldCommit) {
        onValueCommitted(committedValue, nextEventDetails);
      }

      // Normalize only the displayed text
      const canonicalText = formatNumber(committedValue, locale(), formatOptions);
      if (inputValue() !== canonicalText) {
        setInputValue(canonicalText);
      }
    },
    onInput(event: InputEvent) {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.currentTarget as HTMLInputElement;
      allowInputSyncRef.current = false;
      const targetValue = target.value;

      if (targetValue.trim() === '') {
        setInputValue(targetValue);
        setValue(null, createChangeEventDetails(REASONS.inputClear, event));
        return;
      }

      // Update the input text immediately and only fire onValueChange if the typed value is
      // currently parseable into a number. This preserves good UX for IME
      // composition/partial input while still providing live numeric updates when possible.
      const allowedNonNumericKeys = getAllowedNonNumericKeys();
      const isValidCharacterString = Array.from(targetValue).every(
        (ch) =>
          isNumeralChar(ch) ||
          ANY_MINUS_DETECT_RE.test(ch) ||
          allowedNonNumericKeys.has(ch) ||
          // Bidi/format controls are stripped by `parseNumber`; don't let them reject the string
          // (RTL locales insert them around exponent/currency signs, e.g. scientific notation).
          FORMAT_CONTROL_DETECT_RE.test(ch),
      );

      if (!isValidCharacterString) {
        // Unlike React (which force-syncs a controlled `<input>`'s DOM value on every render,
        // reverting an invalid edit the app's state doesn't accept), Solid only re-applies
        // `value={inputValue()}` when that signal actually changes. Since this branch never
        // calls `setInputValue`, nothing would undo the browser's already-applied edit — resync
        // the DOM by hand, mirroring `CheckboxRoot`'s `input.checked = checked()` on a rejected
        // change.
        target.value = inputValue();
        return;
      }

      const parsedValue = parseNumber(targetValue, locale(), format());

      setInputValue(targetValue);

      if (parsedValue !== null) {
        setValue(parsedValue, createChangeEventDetails(REASONS.inputChange, event));
      }
    },
    onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || readOnly() || disabled()) {
        return;
      }

      const target = event.currentTarget as HTMLInputElement;

      // Snapshot the dirty state without clearing it: navigation/allowed keys (ArrowLeft, Tab,
      // Enter, Escape, …) return early without changing the value, so marking the input synced
      // here would wrongly discard dirty-input authority. Only the value-changing branches below
      // mark it synced.
      const hadManualInput = !allowInputSyncRef.current;

      const allowedNonNumericKeys = getAllowedNonNumericKeys();

      let isAllowedNonNumericKey = allowedNonNumericKeys.has(event.key);

      const { decimal, currency, percentSign } = getNumberLocaleDetails(locale(), format());

      const selectionStart = target.selectionStart;
      const selectionEnd = target.selectionEnd;
      const isAllSelected = selectionStart === 0 && selectionEnd === inputValue().length;

      const selectionContainsIndex = (index: number) =>
        selectionStart != null &&
        selectionEnd != null &&
        index >= selectionStart &&
        index < selectionEnd;

      // Only allow a single sign character: permit it when there is no existing sign of either
      // kind, when all text is selected, or when the selection covers the existing sign so it's
      // being replaced.
      const signGroups = [
        [ANY_MINUS_DETECT_RE, ANY_MINUS_RE],
        [ANY_PLUS_DETECT_RE, ANY_PLUS_RE],
      ] as const;
      signGroups.forEach(([detectRe, globalRe]) => {
        if (
          detectRe.test(event.key) &&
          Array.from(allowedNonNumericKeys).some((k) => detectRe.test(k))
        ) {
          const existingIndex = inputValue().search(globalRe);
          const isReplacingExisting = existingIndex !== -1 && selectionContainsIndex(existingIndex);
          isAllowedNonNumericKey =
            !(ANY_MINUS_DETECT_RE.test(inputValue()) || ANY_PLUS_DETECT_RE.test(inputValue())) ||
            isAllSelected ||
            isReplacingExisting;
        }
      });

      // Only allow one of each symbol.
      [decimal, currency, percentSign].forEach((symbol) => {
        if (symbol && event.key === symbol) {
          const symbolIndex = inputValue().indexOf(symbol);
          const isSymbolHighlighted = selectionContainsIndex(symbolIndex);
          isAllowedNonNumericKey =
            !inputValue().includes(symbol) || isAllSelected || isSymbolHighlighted;
        }
      });

      const isNavigateKey = NAVIGATE_KEYS.has(event.key);
      // Alt+ArrowUp/ArrowDown selects smallStep, so don't treat it as a bypass modifier.
      const isStepKey = event.key === 'ArrowUp' || event.key === 'ArrowDown';

      if (
        // Allow composition events (e.g., pinyin)
        // event.isComposing does not work in Safari:
        // https://bugs.webkit.org/show_bug.cgi?id=165004
        event.which === 229 ||
        (event.altKey && !isStepKey) ||
        event.ctrlKey ||
        event.metaKey ||
        isAllowedNonNumericKey ||
        isNumeralChar(event.key) ||
        isNavigateKey
      ) {
        return;
      }

      const willSetHome = event.key === 'Home' && min() != null;
      const willSetEnd = event.key === 'End' && max() != null;

      // Let the browser handle multi-character keys we don't act on (PageUp, Insert, F-keys,
      // Home/End without min/max); invalid single characters are still blocked below.
      if (event.key.length > 1 && !isStepKey && !willSetHome && !willSetEnd) {
        return;
      }

      // Step from the authoritative numeric value unless the input has unsaved manual edits.
      // When the text is already synced, parsing the rounded display would collapse precision,
      // so pass no `currentValue` and let `incrementValue` fall back to the numeric state
      // (mirrors the button path).
      const currentValue = hadManualInput ? parseNumber(inputValue(), locale(), format()) : null;

      const amount = getStepAmount(event);

      // Prevent insertion of text or caret from moving.
      stopEvent(event);

      const commitDetails = createGenericEventDetails(REASONS.keyboard, event);

      let changed = false;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        allowInputSyncRef.current = true;

        // When stepping from the synced numeric state, refresh the commit ref to the current
        // value so a canceled step can't commit a stale `lastChangedValueRef` left over from an
        // earlier change (mirrors the button path).
        if (!hadManualInput) {
          lastChangedValueRef.current = valueRef.current;
        }

        changed = incrementValue(amount, {
          direction: event.key === 'ArrowUp' ? 1 : -1,
          currentValue,
          event,
          reason: REASONS.keyboard,
        });
      } else if (willSetHome) {
        allowInputSyncRef.current = true;
        changed = setValue(min() ?? null, createChangeEventDetails(REASONS.keyboard, event));
      } else if (willSetEnd) {
        allowInputSyncRef.current = true;
        changed = setValue(max() ?? null, createChangeEventDetails(REASONS.keyboard, event));
      }

      if (changed) {
        onValueCommitted(lastChangedValueRef.current ?? valueRef.current, commitDetails);
      }
    },
    onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented || readOnly() || disabled()) {
        return;
      }

      let pastedData = '';

      try {
        pastedData = event.clipboardData?.getData('text/plain') ?? '';
      } catch {
        if (process.env.NODE_ENV !== 'production') {
          warn('<NumberField.Input> could not read clipboard text during paste handling.');
        }

        return;
      }

      // Prevent `onChange` from being called.
      event.preventDefault();

      // Insert the pasted text at the caret/selection instead of replacing the entire value,
      // matching native input behavior (e.g. pasting "5" into "123|" yields "1235").
      const input = event.currentTarget as HTMLInputElement;
      const selectionStart = input.selectionStart ?? inputValue().length;
      const selectionEnd = input.selectionEnd ?? inputValue().length;
      const nextText =
        inputValue().slice(0, selectionStart) + pastedData + inputValue().slice(selectionEnd);

      const parsedValue = parseNumber(nextText, locale(), format());

      if (parsedValue !== null) {
        allowInputSyncRef.current = false;
        pendingCaretRef.current = selectionStart + pastedData.length;
        setValue(parsedValue, createChangeEventDetails(REASONS.inputPaste, event));
        setInputValue(nextText);
      }
    },
  };

  return renderElement('input', componentProps, {
    defaultClass: 'wheel-NumberField-Input',
    slot: 'number-field-input',
    ref: (el: HTMLElement) => {
      inputRef.current = el as HTMLInputElement;
    },
    state,
    props: [
      inputProps as Record<string, any>,
      elementProps as Record<string, any>,
      (props: Record<string, any>) => validation.getValidationProps(disabled(), props),
    ],
    stateAttributesMapping,
  });
}

export interface NumberFieldInputState extends NumberFieldRootState {}

export interface NumberFieldInputProps
  extends BaseUIComponentProps<'input', NumberFieldInputState> {
  /**
   * A user-friendly description of the input's role for assistive tech. This is a role
   * description, not an accessible name — use `Field.Label` or `aria-label` to name the control.
   * @default 'Number field'
   */
  'aria-roledescription'?: string | undefined;
}

export namespace NumberFieldInput {
  export type State = NumberFieldInputState;
  export type Props = NumberFieldInputProps;
}
