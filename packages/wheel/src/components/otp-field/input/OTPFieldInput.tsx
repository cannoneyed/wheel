/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, splitProps, type JSX } from 'solid-js';
import { warn } from '../../base-utils/warn';
import {
  IndexGuessBehavior,
  createCompositeListItem,
} from '../../internals/composite/list/createCompositeListItem';
import { stopEvent } from '../../internals/composite/composite';
import type { BaseUIComponentProps } from '../../internals/types';
import { useDirection } from '../../internals/direction-context/DirectionContext';
import { renderElement } from '../../internals/renderElement';
import {
  createChangeEventDetails,
  createGenericEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { useOTPFieldRootContext, getOTPFieldInputState } from '../root/OTPFieldRootContext';
import type { OTPFieldRootState } from '../root/OTPFieldRoot';
import { inputStateAttributesMapping } from '../utils/stateAttributesMapping';
import { normalizeOTPValueWithDetails, removeOTPCharacter, replaceOTPValue } from '../utils/otp';

/**
 * An individual OTP character input.
 * Renders an `<input>` element.
 *
 * Documentation: [Base UI OTP Field](https://base-ui.com/react/components/otp-field)
 */
export function OTPFieldInput(componentProps: OTPFieldInput.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'aria-label',
    'aria-labelledby',
    'class',
    'style',
    'as',
    'asChild',
    'children',
  ]);

  const {
    activeIndex,
    autoComplete,
    disabled,
    form,
    focusInput,
    queueFocusInput,
    getInputId,
    handleInputBlur,
    handleInputFocus,
    inputMode,
    inputAriaLabelledBy,
    invalid,
    length,
    mask,
    pattern,
    reportValueInvalid,
    readOnly,
    required,
    normalizeValue,
    setValue,
    state,
    validationType,
    value,
  } = useOTPFieldRootContext();

  const { ref: listItemRef, index } = createCompositeListItem({
    indexGuessBehavior: IndexGuessBehavior.GuessFromOrder,
  });
  let inputEl: HTMLInputElement | undefined;
  const direction = useDirection();

  const slotValue = () => value()[index()] ?? '';
  const inputState = getOTPFieldInputState(state, slotValue, index);
  const slotAriaLabel = () => componentProps['aria-label'];
  const inheritedLabel = () => componentProps['aria-labelledby'] ?? inputAriaLabelledBy();
  const ariaLabel = () => (index() === 0 ? undefined : slotAriaLabel());

  if (process.env.NODE_ENV !== 'production') {
    createEffect(() => {
      if (index() !== 0 || slotAriaLabel() == null || inputEl?.labels?.length) {
        return;
      }

      warn(
        '<OTPField.Input> ignores `aria-label` on the first input. Use a `<label>` or ' +
          '`<Field.Label>` to label the OTP field.',
      );
    });
  }

  const inputProps = () => ({
    id: getInputId(index()),
    value: slotValue(),
    type: mask() ? 'password' : 'text',
    inputMode: inputMode(),
    autoComplete: index() === 0 ? autoComplete() : 'off',
    autoCorrect: 'off',
    spellCheck: 'false',
    enterKeyHint: index() === length() - 1 ? 'done' : 'next',
    // Only the first slot has a max length to avoid password manager bubbles appearing after later inputs.
    maxLength: index() === 0 ? length() : undefined,
    tabIndex: activeIndex() === index() ? 0 : -1,
    disabled: disabled(),
    form: form(),
    pattern: pattern(),
    readOnly: readOnly(),
    required: required(),
    'aria-labelledby': ariaLabel() == null ? inheritedLabel() : undefined,
    'aria-invalid': !disabled() && invalid() ? true : undefined,
    'aria-label': ariaLabel(),
    onMouseDown(event: MouseEvent) {
      if (event.defaultPrevented || disabled()) {
        return;
      }

      event.preventDefault();
      focusInput(index());
    },
    onFocus(event: FocusEvent) {
      if (event.defaultPrevented || disabled()) {
        return;
      }

      handleInputFocus(index(), event);
    },
    onBlur(event: FocusEvent) {
      if (event.defaultPrevented) {
        return;
      }

      handleInputBlur(event);
    },
    // Deviation from upstream: `onInput` (like `onClick`/`onKeyDown`) is one of Solid's delegated
    // events, and Solid's delegated dispatcher skips invoking the handler entirely when the
    // element is `disabled` (`node.disabled` short-circuits before the handler runs). Real
    // browsers never fire input events on a disabled control either, so this only matters for
    // tests that dispatch the event programmatically — but when they do, our own `disabled()`
    // guard below (needed to revert an externally-forced DOM mutation) would never run. The
    // `on:` prefix opts this single listener out of delegation (plain `addEventListener`), so it
    // always runs and the guard below takes effect.
    'on:input': function onInput(event: InputEvent) {
      const target = event.currentTarget as HTMLInputElement;

      // Deviation from upstream: React's controlled `value={slotValue}` re-syncs the DOM on
      // every commit regardless of whether the computed value actually changed, so a rejected
      // native edit that leaves state untouched still gets reverted for free. Solid only touches
      // the DOM when the reactive `value` prop's *computed result* changes, so an edit this
      // handler declines to commit (disabled/readOnly/prevented, or normalized away entirely)
      // must be reverted explicitly here instead.
      if (event.defaultPrevented || disabled() || readOnly()) {
        target.value = slotValue();
        return;
      }

      const rawValue = target.value;
      const [nextDigits, didRejectCharacters] = normalizeOTPValueWithDetails(
        rawValue,
        length(),
        validationType(),
        normalizeValue(),
      );

      if (didRejectCharacters) {
        reportValueInvalid(rawValue, createGenericEventDetails(REASONS.inputChange, event));
      }

      if (nextDigits === '') {
        if (rawValue === '') {
          // Deviation from upstream: a canceled `onValueChange` (or a no-op normalize-to-same-
          // value) leaves state untouched, but the native 'input' event already cleared the DOM
          // value for real — React's controlled `value={slotValue}` would force it back on the
          // next render; Solid only re-applies the DOM value when the computed prop actually
          // changes, so revert explicitly when `setValue` declines to commit.
          const committed = setValue(
            removeOTPCharacter(value(), index()),
            createChangeEventDetails(REASONS.inputClear, event),
          );
          if (committed == null) {
            target.value = slotValue();
          }
        } else {
          target.value = slotValue();
          if (slotValue() !== '') {
            target.select();
          }
        }
        return;
      }

      const nextValue = replaceOTPValue(
        value(),
        index(),
        nextDigits,
        length(),
        validationType(),
        normalizeValue(),
      );

      const committed = setValue(
        nextValue,
        createChangeEventDetails(REASONS.inputChange, event),
        (committedValue) => {
          const nextInput = Math.min(index() + nextDigits.length, length() - 1);
          queueFocusInput(nextInput, committedValue);
        },
      );

      if (committed == null) {
        target.value = slotValue();
      }
    },
    onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || disabled()) {
        return;
      }

      const firstIndex = 0;
      const lastIndex = Math.max(length() - 1, firstIndex);
      const endTargetIndex = Math.min(value().length, lastIndex);
      const hasBoundaryModifier = (event.ctrlKey || event.metaKey) && !event.altKey;
      const isRtl = direction() === 'rtl';
      const previousKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
      const nextKey = isRtl ? 'ArrowLeft' : 'ArrowRight';

      if (event.key === previousKey) {
        stopEvent(event);
        focusInput(hasBoundaryModifier ? firstIndex : Math.max(firstIndex, index() - 1));
        return;
      }

      if (event.key === nextKey) {
        stopEvent(event);
        focusInput(hasBoundaryModifier ? endTargetIndex : Math.min(lastIndex, index() + 1));
        return;
      }

      if (event.key === 'Home' || event.key === 'ArrowUp') {
        stopEvent(event);
        focusInput(firstIndex);
        return;
      }

      if (event.key === 'End' || event.key === 'ArrowDown') {
        stopEvent(event);
        focusInput(endTargetIndex);
        return;
      }

      if (readOnly()) {
        return;
      }

      function setKeyboardValue(nextValue: string, targetIndex: number) {
        setValue(nextValue, createChangeEventDetails(REASONS.keyboard, event), (committedValue) => {
          queueFocusInput(targetIndex, committedValue);
        });
      }

      if (event.key === 'Backspace' && hasBoundaryModifier) {
        stopEvent(event);
        setKeyboardValue('', firstIndex);
        return;
      }

      if (event.key === 'Delete') {
        stopEvent(event);
        setKeyboardValue(removeOTPCharacter(value(), index()), index());
        return;
      }

      const target = event.currentTarget as HTMLInputElement;
      const inputValue = target.value;
      const fullSelection =
        target.selectionStart === 0 && target.selectionEnd === inputValue.length;

      if (event.key.length === 1 && fullSelection && slotValue() === event.key) {
        stopEvent(event);
        if (index() < length() - 1) {
          focusInput(index() + 1);
        }
        return;
      }

      if (event.key === 'Backspace') {
        stopEvent(event);
        const targetIndex = Math.max(firstIndex, index() - 1);
        const deleteIndex = slotValue() === '' ? targetIndex : index();
        setKeyboardValue(removeOTPCharacter(value(), deleteIndex), targetIndex);
      }
    },
    onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented || disabled() || readOnly()) {
        return;
      }

      let rawValue = '';

      try {
        rawValue = event.clipboardData?.getData('text/plain') ?? '';
      } catch {
        if (process.env.NODE_ENV !== 'production') {
          warn('<OTPField.Input> could not read clipboard text during paste handling.');
        }

        return;
      }

      event.preventDefault();

      const [nextDigits, didRejectCharacters] = normalizeOTPValueWithDetails(
        rawValue,
        length(),
        validationType(),
        normalizeValue(),
      );

      if (didRejectCharacters) {
        reportValueInvalid(rawValue, createGenericEventDetails(REASONS.inputPaste, event));
      }

      if (nextDigits === '') {
        return;
      }

      setValue(
        replaceOTPValue(value(), index(), nextDigits, length(), validationType(), normalizeValue()),
        createChangeEventDetails(REASONS.inputPaste, event),
        (committedValue) => {
          const nextInput = Math.min(index() + nextDigits.length, length() - 1);
          queueFocusInput(nextInput, committedValue);
        },
      );
    },
  });

  return renderElement('input', componentProps, {
    defaultClass: 'wheel-OTPField-Input',
    slot: 'otp-field-input',
    ref: [
      listItemRef,
      (el: HTMLInputElement) => {
        inputEl = el;
      },
    ],
    state: inputState,
    props: [inputProps, elementProps as Record<string, any>],
    stateAttributesMapping: inputStateAttributesMapping,
  });
}

export interface OTPFieldInputState extends Omit<OTPFieldRootState, 'filled' | 'value'> {
  /**
   * Whether this input contains a character.
   */
  filled: boolean;
  /**
   * The input index.
   */
  index: number;
  /**
   * The character rendered in this slot.
   */
  value: string;
}

export interface OTPFieldInputProps extends BaseUIComponentProps<'input', OTPFieldInputState> {}

export namespace OTPFieldInput {
  export type State = OTPFieldInputState;
  export type Props = OTPFieldInputProps;
}
