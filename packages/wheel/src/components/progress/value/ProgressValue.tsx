/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { renderElement, type RenderElementComponentProps } from '../../internals/renderElement';
import { useProgressRootContext } from '../root/ProgressRootContext';
import type { ProgressRootState } from '../root/ProgressRoot';
import { stateAttributesMapping } from '../stateAttributesMapping';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * A text element displaying the current value.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Progress](https://base-ui.com/react/components/progress)
 */
export function ProgressValue(componentProps: ProgressValue.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
  ]);

  const { value, formattedValue, state } = useProgressRootContext();

  const formattedValueArg = () => (value() == null ? 'indeterminate' : formattedValue());
  const formattedValueDisplay = () => (value() == null ? null : formattedValue());

  return renderElement(
    'span',
    componentProps as unknown as RenderElementComponentProps<ProgressValueState>,
    {
      defaultClass: 'wheel-Progress-Value',
      slot: 'progress-value',
      state,
      props: [() => ({ 'aria-hidden': true }), elementProps as Record<string, any>],
      stateAttributesMapping,
      children: () => {
        const children = componentProps.children;
        if (typeof children === 'function') {
          return (
            children as (formattedValue: string | null, value: number | null) => JSX.Element
          )(formattedValueArg(), value());
        }
        return formattedValueDisplay();
      },
    },
  );
}

export interface ProgressValueState extends ProgressRootState {}

export interface ProgressValueProps
  extends Omit<BaseUIComponentProps<'span', ProgressValueState>, 'children'> {
  children?:
    | null
    | ((formattedValue: string | null, value: number | null) => JSX.Element)
    | undefined;
}

export namespace ProgressValue {
  export type State = ProgressValueState;
  export type Props = ProgressValueProps;
}
