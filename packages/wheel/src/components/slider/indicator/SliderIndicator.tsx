/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { valueToPercent } from '../../utils/valueToPercent';
import { renderElement } from '../../internals/renderElement';
import { useSliderRootContext } from '../root/SliderRootContext';
import { sliderStateAttributesMapping } from '../root/stateAttributesMapping';
import type { SliderRootState } from '../root/SliderRoot';

function getInsetStyles(
  vertical: boolean,
  range: boolean,
  start: number | undefined,
  end: number | undefined,
): Record<string, unknown> {
  const visibility =
    start === undefined || (range && end === undefined) ? ('hidden' as const) : undefined;

  const startEdge = vertical ? 'bottom' : 'inset-inline-start';
  const mainSide = vertical ? 'height' : 'width';
  const crossSide = vertical ? 'width' : 'height';

  const styles: Record<string, unknown> = {
    visibility,
    position: vertical ? 'absolute' : 'relative',
    [crossSide]: 'inherit',
  };

  styles['--start-position'] = `${start ?? 0}%`;

  if (!range) {
    styles[startEdge] = 0;
    styles[mainSide] = 'var(--start-position)';

    return styles;
  }

  styles['--relative-size'] = `${(end ?? 0) - (start ?? 0)}%`;

  styles[startEdge] = 'var(--start-position)';
  styles[mainSide] = 'var(--relative-size)';

  return styles;
}

function getCenteredStyles(
  vertical: boolean,
  range: boolean,
  start: number,
  end: number,
): Record<string, unknown> {
  const startEdge = vertical ? 'bottom' : 'inset-inline-start';
  const mainSide = vertical ? 'height' : 'width';
  const crossSide = vertical ? 'width' : 'height';

  const styles: Record<string, unknown> = {
    position: vertical ? 'absolute' : 'relative',
    [crossSide]: 'inherit',
  };

  if (!range) {
    styles[startEdge] = 0;
    styles[mainSide] = `${start}%`;

    return styles;
  }

  const size = end - start;

  styles[startEdge] = `${start}%`;
  styles[mainSide] = `${size}%`;

  return styles;
}

/**
 * Visualizes the current value of the slider.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Slider](https://base-ui.com/react/components/slider)
 */
export function SliderIndicator(componentProps: SliderIndicator.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { indicatorPosition, inset, max, min, orientation, state, values } = useSliderRootContext();

  const vertical = () => orientation() === 'vertical';
  const range = () => values().length > 1;

  const style = () => {
    if (inset()) {
      const position = indicatorPosition();
      return getInsetStyles(vertical(), range(), position[0], position[1]);
    }

    const currentValues = values();
    return getCenteredStyles(
      vertical(),
      range(),
      valueToPercent(currentValues[0], min(), max()),
      valueToPercent(currentValues[currentValues.length - 1], min(), max()),
    );
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Slider-Indicator',
    slot: 'slider-indicator',
    state,
    props: [
      () => ({
        style: style(),
      }),
      elementProps,
    ],
    stateAttributesMapping: sliderStateAttributesMapping,
  });
}

export interface SliderIndicatorState extends SliderRootState {}

export interface SliderIndicatorProps extends BaseUIComponentProps<'div', SliderIndicatorState> {}

export namespace SliderIndicator {
  export type State = SliderIndicatorState;
  export type Props = SliderIndicatorProps;
}
