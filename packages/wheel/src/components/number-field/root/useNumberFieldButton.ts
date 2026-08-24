/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { Accessor } from 'solid-js';
import { usePressAndHold, isTouchLikePointerType } from './usePressAndHold';
import {
  CHANGE_VALUE_TICK_DELAY,
  START_AUTO_CHANGE_DELAY,
  SCROLLING_POINTER_MOVE_DISTANCE,
} from '../utils/constants';
import { parseNumber } from '../utils/parse';
import {
  createChangeEventDetails,
  createGenericEventDetails,
} from '../../internals/createBaseUIEventDetails';
import type { EventWithOptionalKeyState, IncrementValueParameters } from '../utils/types';
import type { NumberFieldRoot } from './NumberFieldRoot';
import { REASONS } from '../../internals/reasons';
import type { HTMLProps } from '../../internals/types';

const SELECT_NONE_STYLE = {
  '-webkit-user-select': 'none',
  'user-select': 'none',
} as const;

/**
 * Solid port of upstream's `useNumberFieldButton`. `formatOptionsRef` collapses to a plain
 * `format` accessor (see NumberFieldRootContext.ts deviation note); `valueRef` is kept as a real
 * ref because `commitValue` deliberately writes the *raw* parsed value into it below, diverging
 * from the clamped reactive `value` — the subsequent step must compute its base off the literal
 * typed number.
 */
export function useNumberFieldButton(params: UseNumberFieldButtonParameters): HTMLProps {
  const {
    allowInputSyncRef,
    disabled,
    format,
    getStepAmount,
    id,
    incrementValue,
    inputRef,
    inputValue,
    isIncrement,
    locale,
    readOnly,
    setValue,
    valueRef,
    lastChangedValueRef,
    onValueCommitted,
  } = params;

  const pressReason: NumberFieldRoot.ChangeEventReason = isIncrement
    ? REASONS.incrementPress
    : REASONS.decrementPress;

  function commitValue(nativeEvent: Event) {
    const shouldCommitInputValue = !allowInputSyncRef.current;
    allowInputSyncRef.current = true;

    if (!shouldCommitInputValue) {
      // The input is already synced, so step from the authoritative numeric value rather than
      // re-parsing the rounded display text. Refresh the commit ref to the current value so a
      // subsequent canceled step can't commit a stale `lastChangedValueRef` left over from an
      // earlier change (the `setValue` that used to refresh it is now skipped on this path).
      lastChangedValueRef.current = valueRef.current;
      return;
    }

    // The input is dirty but not yet blurred, so the value won't have been committed.
    const parsedValue = parseNumber(inputValue(), locale(), format());

    if (parsedValue !== null) {
      // Sync the dirty typed value with no direction so it isn't directionally snapped
      // (`snapOnStep`) before the real increment/decrement runs, which would otherwise emit a
      // spurious intermediate value.
      const details = createChangeEventDetails(pressReason, nativeEvent as any);
      setValue(parsedValue, details);

      // Only sync the ref base when the commit wasn't canceled, so a subsequent increment in the
      // same interaction steps from the value actually applied. Deliberately the *raw* parsed
      // value (not the clamped value `setValue` just stored) — see the file-level deviation note.
      if (!details.isCanceled) {
        valueRef.current = parsedValue;
      }
    }
  }

  const { pointerHandlers, shouldSkipClick } = usePressAndHold({
    disabled: () => disabled() || readOnly(),
    elementRef: inputRef,
    tickDelay: CHANGE_VALUE_TICK_DELAY,
    startDelay: START_AUTO_CHANGE_DELAY,
    scrollDistance: SCROLLING_POINTER_MOVE_DISTANCE,
    tick(triggerEvent) {
      const amount = getStepAmount(triggerEvent as EventWithOptionalKeyState);
      return incrementValue(amount, {
        direction: isIncrement ? 1 : -1,
        event: triggerEvent,
        reason: pressReason,
      });
    },
    onStop(nativeEvent: PointerEvent) {
      // `onStop` fires on every release; fall back to the current value when no tick changed it.
      // Step interactions never commit `null`, so the `??` can't mask a legitimate null commit.
      const committed = lastChangedValueRef.current ?? valueRef.current;
      onValueCommitted(committed, createGenericEventDetails(pressReason, nativeEvent));
    },
  });

  return {
    get disabled() {
      return disabled();
    },
    'aria-label': isIncrement ? 'Increase' : 'Decrease',
    // Keyboard users shouldn't have access to the buttons, since they can use the input element
    // to change the value. On the other hand, `aria-hidden` is not applied because touch screen
    // readers should be able to use the buttons.
    get 'aria-controls'() {
      return id();
    },
    tabIndex: -1,
    style: SELECT_NONE_STYLE,
    ...pointerHandlers,
    onClick(event: MouseEvent) {
      const isDisabled = disabled() || readOnly();
      if (event.defaultPrevented || isDisabled || shouldSkipClick(event)) {
        return;
      }

      commitValue(event);

      const amount = getStepAmount(event as EventWithOptionalKeyState);

      const prev = valueRef.current;

      incrementValue(amount, {
        direction: isIncrement ? 1 : -1,
        event,
        reason: pressReason,
      });

      const committed = lastChangedValueRef.current ?? valueRef.current;
      if (committed !== prev) {
        onValueCommitted(committed, createGenericEventDetails(pressReason, event));
      }
    },
    onPointerDown(event: PointerEvent) {
      const isMainButton = !event.button || event.button === 0;
      if (event.defaultPrevented || readOnly() || !isMainButton || disabled()) {
        return;
      }

      // Sync dirty input value before starting the hold sequence.
      commitValue(event);
      // Treat `lastChangedValueRef` as a per-hold result slot. If the first tick is a no-op or is
      // canceled, `onStop` should fall back to the current value, not a previous interaction.
      lastChangedValueRef.current = null;

      if (!isTouchLikePointerType(event.pointerType)) {
        // Focus the input so the user can continue with keyboard interactions.
        inputRef.current?.focus();
      }

      pointerHandlers.onPointerDown(event);
    },
  };
}

export interface UseNumberFieldButtonParameters {
  allowInputSyncRef: { current: boolean };
  disabled: Accessor<boolean>;
  format: Accessor<Intl.NumberFormatOptions | undefined>;
  getStepAmount: (event?: EventWithOptionalKeyState) => number;
  id: Accessor<string | undefined>;
  incrementValue: (amount: number, params: IncrementValueParameters) => boolean;
  inputRef: { current: HTMLInputElement | null };
  inputValue: Accessor<string>;
  isIncrement: boolean;
  locale: Accessor<Intl.LocalesArgument | undefined>;
  readOnly: Accessor<boolean>;
  setValue: (value: number | null, details: NumberFieldRoot.ChangeEventDetails) => boolean;
  valueRef: { current: number | null };
  lastChangedValueRef: { current: number | null };
  onValueCommitted: (
    value: number | null,
    eventDetails: NumberFieldRoot.CommitEventDetails,
  ) => void;
}
