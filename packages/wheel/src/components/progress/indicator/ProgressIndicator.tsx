/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { ProgressRootState } from '../root/ProgressRoot';
import { useProgressRootContext } from '../root/ProgressRootContext';
import { stateAttributesMapping } from '../stateAttributesMapping';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * Visualizes the completion status of the task.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Progress](https://base-ui.com/react/components/progress)
 */
export function ProgressIndicator(componentProps: ProgressIndicator.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
  ]);

  const { percentageValue, state } = useProgressRootContext();

  const indicatorStyle = () => {
    const pct = percentageValue();
    if (pct == null) {
      return {};
    }
    return {
      'inset-inline-start': '0',
      height: 'inherit',
      width: `${pct}%`,
    };
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Progress-Indicator',
    slot: 'progress-indicator',
    state,
    props: [() => ({ style: indicatorStyle() }), elementProps as Record<string, any>],
    stateAttributesMapping,
  });
}

export interface ProgressIndicatorState extends ProgressRootState {}

export interface ProgressIndicatorProps
  extends BaseUIComponentProps<'div', ProgressIndicatorState> {}

export namespace ProgressIndicator {
  export type State = ProgressIndicatorState;
  export type Props = ProgressIndicatorProps;
}
