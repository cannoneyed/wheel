/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { renderElement, type RenderElementComponentProps } from '../../internals/renderElement';
import { useMeterRootContext } from '../root/MeterRootContext';
import type { MeterRootState } from '../root/MeterRoot';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * A text element displaying the current value.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Meter](https://base-ui.com/react/components/meter)
 */
export function MeterValue(componentProps: MeterValue.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
  ]);

  const { value, formattedValue } = useMeterRootContext();

  return renderElement(
    'span',
    componentProps as unknown as RenderElementComponentProps<MeterValueState>,
    {
      defaultClass: 'wheel-Meter-Value',
      slot: 'meter-value',
      props: [() => ({ 'aria-hidden': true }), elementProps as Record<string, any>],
      children: () => {
        const children = componentProps.children;
        if (typeof children === 'function') {
          return (children as (formattedValue: string, value: number) => JSX.Element)(
            formattedValue(),
            value(),
          );
        }
        return formattedValue();
      },
    },
  );
}

export interface MeterValueState extends MeterRootState {}

export interface MeterValueProps
  extends Omit<BaseUIComponentProps<'span', MeterValueState>, 'children'> {
  children?: null | ((formattedValue: string, value: number) => JSX.Element) | undefined;
}

export namespace MeterValue {
  export type State = MeterValueState;
  export type Props = MeterValueProps;
}
