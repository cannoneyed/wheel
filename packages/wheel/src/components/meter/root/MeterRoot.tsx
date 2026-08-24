/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal, wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createMemo, createSignal, splitProps } from 'solid-js';
import { visuallyHidden } from '../../base-utils/visuallyHidden';
import { renderElement } from '../../internals/renderElement';
import { clamp } from '../../internals/clamp';
import type { BaseUIComponentProps } from '../../internals/types';
import { formatNumber } from '../../utils/formatNumber';
import { valueToPercent } from '../../utils/valueToPercent';
import { MeterRootContext } from './MeterRootContext';

interface ComputedMeter {
  percentageValue: number;
  clampedValue: number;
  formattedValue: string;
}

/**
 * Groups all parts of the meter and provides the value for screen readers.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Meter](https://base-ui.com/react/components/meter)
 */
export function MeterRoot(componentProps: MeterRoot.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'format',
    'getAriaValueText',
    'locale',
    'max',
    'min',
    'value',
  ]);

  const max = () => componentProps.max ?? 100;
  const min = () => componentProps.min ?? 0;

  const [labelId, setLabelId] = createSignal<string | undefined>(undefined);

  // `clamp` handles infinity, but NaN needs an explicit fallback before normalizing range outputs.
  const computed = createMemo<ComputedMeter>(() => {
    const value = componentProps.value;
    const rawPercentage = valueToPercent(value, min(), max());
    const percentageValue = clamp(Number.isNaN(rawPercentage) ? 0 : rawPercentage, 0, 100);
    const clampedValue = clamp(Number.isNaN(value) ? min() : value, min(), max());

    // Without an explicit `format`, the value is displayed as its position within the range so
    // the text stays in sync with the indicator fill for any `min`/`max` (not just the default
    // 0–100).
    const formattedValue = componentProps.format
      ? formatNumber(value, componentProps.locale, componentProps.format)
      : formatNumber(percentageValue / 100, componentProps.locale, { style: 'percent' });

    return { percentageValue, clampedValue, formattedValue };
  });

  const ariaValueText = () => {
    const formattedValue = computed().formattedValue;
    if (componentProps.getAriaValueText) {
      return componentProps.getAriaValueText(formattedValue, componentProps.value);
    }
    return formattedValue;
  };

  const state: MeterRoot.State = {};

  const contextValue: MeterRootContext = {
    formattedValue: () => computed().formattedValue,
    max,
    min,
    percentageValue: () => computed().percentageValue,
    setLabelId,
    value: () => componentProps.value,
  };

  return (
    <MeterRootContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Meter-Root',
        slot: 'meter-root',
        state,
        props: [
          () => ({
            'aria-labelledby': labelId(),
            'aria-valuemax': max(),
            'aria-valuemin': min(),
            'aria-valuenow': computed().clampedValue,
            'aria-valuetext': ariaValueText(),
            role: 'meter',
          }),
          elementProps as Record<string, any>,
        ],
        children: () => (
          <>
            {componentProps.children}
            <span role="presentation" style={visuallyHidden}>
              {/* force NVDA to read the label https://github.com/mui/base-ui/issues/4184 */}x
            </span>
          </>
        ),
      })}
    </MeterRootContext.Provider>
  );
}

export interface MeterRootState {}

export interface MeterRootProps extends BaseUIComponentProps<'div', MeterRootState> {
  /**
   * A string value that provides a user-friendly name for `aria-valuenow`, the current value of the meter.
   */
  'aria-valuetext'?: string | undefined;
  /**
   * Options to format the value.
   */
  format?: Intl.NumberFormatOptions | undefined;
  /**
   * A function that returns a string value that provides a human-readable text alternative for `aria-valuenow`, the current value of the meter.
   */
  getAriaValueText?: ((formattedValue: string, value: number) => string) | undefined;
  /**
   * The locale used by `Intl.NumberFormat` when formatting the value.
   * Defaults to the user's runtime locale.
   */
  locale?: Intl.LocalesArgument | undefined;
  /**
   * The maximum value
   * @default 100
   */
  max?: number | undefined;
  /**
   * The minimum value
   * @default 0
   */
  min?: number | undefined;
  /**
   * The current value.
   */
  value: number;
}

export namespace MeterRoot {
  export type State = MeterRootState;
  export type Props = MeterRootProps;
}
