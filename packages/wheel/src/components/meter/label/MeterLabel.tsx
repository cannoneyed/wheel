/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import { createRegisteredLabelId } from '../../internals/createRegisteredLabelId';
import { useMeterRootContext } from '../root/MeterRootContext';
import type { MeterRootState } from '../root/MeterRoot';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * An accessible label for the meter.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Meter](https://base-ui.com/react/components/meter)
 */
export function MeterLabel(componentProps: MeterLabel.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const { setLabelId } = useMeterRootContext();

  const id = createRegisteredLabelId(() => componentProps.id, setLabelId);

  return renderElement('span', componentProps, {
    defaultClass: 'wheel-Meter-Label',
    slot: 'meter-label',
    props: [
      () => ({
        id: id(),
        role: 'presentation',
      }),
      elementProps as Record<string, any>,
    ],
  });
}

export interface MeterLabelState extends MeterRootState {}

export interface MeterLabelProps extends BaseUIComponentProps<'span', MeterLabelState> {}

export namespace MeterLabel {
  export type State = MeterLabelState;
  export type Props = MeterLabelProps;
}
