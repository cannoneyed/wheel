/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { formatNumber } from '../../utils/formatNumber';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement, type RenderElementComponentProps } from '../../internals/renderElement';
import { useSliderRootContext } from '../root/SliderRootContext';
import { sliderStateAttributesMapping } from '../root/stateAttributesMapping';
import type { SliderRootState } from '../root/SliderRoot';

/**
 * Displays the current value of the slider as text.
 * Renders an `<output>` element.
 *
 * Documentation: [Base UI Slider](https://base-ui.com/react/components/slider)
 */
export function SliderValue(componentProps: SliderValue.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'aria-live',
  ]);

  const { thumbMap, state, values, format, locale } = useSliderRootContext();

  const outputFor = () => {
    let htmlFor = '';
    for (const thumbMetadata of thumbMap().values()) {
      if (thumbMetadata?.inputId) {
        htmlFor += `${thumbMetadata.inputId} `;
      }
    }

    const trimmed = htmlFor.trim();
    return trimmed === '' ? undefined : trimmed;
  };

  const formattedValues = () => {
    const arr: string[] = [];
    const currentValues = values();
    for (let i = 0; i < currentValues.length; i += 1) {
      arr.push(formatNumber(currentValues[i], locale(), format()));
    }
    return arr;
  };

  const defaultDisplayValue = () => {
    const currentValues = values();
    const formatted = formattedValues();
    return currentValues.map((v, i) => formatted[i] || v).join(' – ');
  };

  return renderElement('output', componentProps as unknown as RenderElementComponentProps<SliderRootState>, {
    defaultClass: 'wheel-Slider-Value',
    slot: 'slider-value',
    state,
    props: [
      () => ({
        // off by default because it will keep announcing when the slider is being dragged
        // and also when the value is changing (but not yet committed)
        'aria-live': componentProps['aria-live'] ?? 'off',
        htmlFor: outputFor(),
      }),
      elementProps,
    ],
    stateAttributesMapping: sliderStateAttributesMapping,
    children: () => {
      const children = componentProps.children;
      if (typeof children === 'function') {
        return (children as SliderValueRenderFn)(formattedValues(), values());
      }
      return defaultDisplayValue();
    },
  });
}

type SliderValueRenderFn = (
  formattedValues: readonly string[],
  values: readonly number[],
) => JSX.Element;

export interface SliderValueState extends SliderRootState {}

export interface SliderValueProps
  extends Omit<BaseUIComponentProps<'output', SliderValueState>, 'children'> {
  children?: null | SliderValueRenderFn | undefined;
}

export namespace SliderValue {
  export type State = SliderValueState;
  export type Props = SliderValueProps;
}
