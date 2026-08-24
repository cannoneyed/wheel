/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import { createRegisteredLabelId } from '../../internals/createRegisteredLabelId';
import { useProgressRootContext } from '../root/ProgressRootContext';
import { stateAttributesMapping } from '../stateAttributesMapping';
import type { ProgressRootState } from '../root/ProgressRoot';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * An accessible label for the progress bar.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Progress](https://base-ui.com/react/components/progress)
 */
export function ProgressLabel(componentProps: ProgressLabel.Props) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const { setLabelId, state } = useProgressRootContext();

  const id = createRegisteredLabelId(() => componentProps.id, setLabelId);

  return renderElement('span', componentProps, {
    defaultClass: 'wheel-Progress-Label',
    slot: 'progress-label',
    state,
    props: [
      () => ({
        id: id(),
        role: 'presentation',
      }),
      elementProps as Record<string, any>,
    ],
    stateAttributesMapping,
  });
}

export interface ProgressLabelState extends ProgressRootState {}

export interface ProgressLabelProps extends BaseUIComponentProps<'span', ProgressLabelState> {}

export namespace ProgressLabel {
  export type State = ProgressLabelState;
  export type Props = ProgressLabelProps;
}
