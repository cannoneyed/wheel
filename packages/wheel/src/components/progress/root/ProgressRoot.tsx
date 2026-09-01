/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { useSignal } from '../../../core/local-state';
import { createMemo, splitProps } from 'solid-js';
import { visuallyHidden } from '../../base-utils/visuallyHidden';
import { renderElement } from '../../internals/renderElement';
import { clamp } from '../../internals/clamp';
import type { BaseUIComponentProps } from '../../internals/types';
import { formatNumber } from '../../utils/formatNumber';
import { valueToPercent } from '../../utils/valueToPercent';
import { ProgressRootContext } from './ProgressRootContext';
import { stateAttributesMapping } from '../stateAttributesMapping';

function getDefaultAriaValueText(formattedValue: string | null, value: number | null) {
  if (value == null) {
    return 'indeterminate progress';
  }

  return formattedValue ?? '';
}

interface ComputedProgress {
  status: ProgressStatus;
  percentageValue: number | null;
  clampedValue: number | null;
  formattedValue: string;
}

/**
 * Groups all parts of the progress bar and provides the task completion status to screen readers.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Progress](https://base-ui.com/react/components/progress)
 */
export function ProgressRoot(componentProps: ProgressRoot.Props) {
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

  const [labelId, setLabelId] = useSignal<string | undefined>(undefined, 'labelId');

  // `value === null` (or any non-finite value) keeps Progress indeterminate. Otherwise compute a
  // single clamped value and normalized percentage so completion status, `aria-valuenow`, the
  // formatted text, the default `aria-valuetext`, and the indicator width all stay in sync for any
  // `min`/`max` (not just the default 0–100).
  const computed = createMemo<ComputedProgress>(() => {
    const value = componentProps.value;

    if (value != null && Number.isFinite(value)) {
      const rawPercentage = valueToPercent(value, min(), max());
      const percentageValue = clamp(Number.isNaN(rawPercentage) ? 0 : rawPercentage, 0, 100);
      const clampedValue = clamp(value, min(), max());
      const status: ProgressStatus = clampedValue === max() ? 'complete' : 'progressing';
      // Without an explicit `format`, the value is displayed as its position within the range so
      // the text stays in sync with the indicator fill.
      const formattedValue = componentProps.format
        ? formatNumber(value, componentProps.locale, componentProps.format)
        : formatNumber(percentageValue / 100, componentProps.locale, { style: 'percent' });

      return { status, percentageValue, clampedValue, formattedValue };
    }

    return { status: 'indeterminate', percentageValue: null, clampedValue: null, formattedValue: '' };
  });

  const state: ProgressRoot.State = {
    get status() {
      return computed().status;
    },
  };

  const ariaValueText = () => {
    const getAriaValueText = componentProps.getAriaValueText ?? getDefaultAriaValueText;
    return getAriaValueText(computed().formattedValue, componentProps.value ?? null);
  };

  const contextValue: ProgressRootContext = {
    formattedValue: () => computed().formattedValue,
    max,
    min,
    percentageValue: () => computed().percentageValue,
    value: () => componentProps.value ?? null,
    setLabelId,
    state,
    status: () => computed().status,
  };

  return (
    <ProgressRootContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Progress-Root',
        slot: 'progress-root',
        state,
        props: [
          () => ({
            'aria-labelledby': labelId(),
            'aria-valuemax': max(),
            'aria-valuemin': min(),
            'aria-valuenow': computed().clampedValue ?? undefined,
            'aria-valuetext': ariaValueText(),
            role: 'progressbar',
          }),
          elementProps as Record<string, any>,
        ],
        stateAttributesMapping,
        children: () => (
          <>
            {componentProps.children}
            <span role="presentation" style={visuallyHidden}>
              {/* force NVDA to read the label https://github.com/mui/base-ui/issues/4184 */}x
            </span>
          </>
        ),
      })}
    </ProgressRootContext.Provider>
  );
}

export type ProgressStatus = 'indeterminate' | 'progressing' | 'complete';

export interface ProgressRootState {
  /**
   * The current status.
   */
  status: ProgressStatus;
}

export interface ProgressRootProps extends BaseUIComponentProps<'div', ProgressRootState> {
  /**
   * A string value that provides a user-friendly name for `aria-valuenow`, the current value of the progress bar.
   */
  'aria-valuetext'?: string | undefined;
  /**
   * Options to format the value.
   */
  format?: Intl.NumberFormatOptions | undefined;
  /**
   * Accepts a function which returns a string value that provides a human-readable text alternative for the current value of the progress bar.
   */
  getAriaValueText?: ((formattedValue: string | null, value: number | null) => string) | undefined;
  /**
   * The locale used by `Intl.NumberFormat` when formatting the value.
   * Defaults to the user's runtime locale.
   */
  locale?: Intl.LocalesArgument | undefined;
  /**
   * The maximum value.
   * @default 100
   */
  max?: number | undefined;
  /**
   * The minimum value.
   * @default 0
   */
  min?: number | undefined;
  /**
   * The current value. The component is indeterminate when value is `null`.
   */
  value: number | null;
}

export namespace ProgressRoot {
  export type State = ProgressRootState;
  export type Props = ProgressRootProps;
}
