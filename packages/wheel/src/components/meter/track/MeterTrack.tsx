/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { MeterRootState } from '../root/MeterRoot';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * Contains the meter indicator and represents the entire range of the meter.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Meter](https://base-ui.com/react/components/meter)
 */
export function MeterTrack(componentProps: MeterTrack.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
  ]);

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Meter-Track',
    slot: 'meter-track',
    props: [elementProps as Record<string, any>],
  });
}

export interface MeterTrackState extends MeterRootState {}

export interface MeterTrackProps extends BaseUIComponentProps<'div', MeterTrackState> {}

export namespace MeterTrack {
  export type State = MeterTrackState;
  export type Props = MeterTrackProps;
}
