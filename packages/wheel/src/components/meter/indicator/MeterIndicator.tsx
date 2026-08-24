/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { MeterRootState } from '../root/MeterRoot';
import { useMeterRootContext } from '../root/MeterRootContext';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * Visualizes the position of the value along the range.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Meter](https://base-ui.com/react/components/meter)
 */
export function MeterIndicator(componentProps: MeterIndicator.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
  ]);

  const { percentageValue } = useMeterRootContext();

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Meter-Indicator',
    slot: 'meter-indicator',
    props: [
      () => ({
        style: {
          'inset-inline-start': '0',
          height: 'inherit',
          width: `${percentageValue()}%`,
        },
      }),
      elementProps as Record<string, any>,
    ],
  });
}

export interface MeterIndicatorState extends MeterRootState {}

export interface MeterIndicatorProps extends BaseUIComponentProps<'div', MeterIndicatorState> {}

export namespace MeterIndicator {
  export type State = MeterIndicatorState;
  export type Props = MeterIndicatorProps;
}
