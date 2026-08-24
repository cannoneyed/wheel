/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useNumberFieldRootContext } from '../root/NumberFieldRootContext';
import type { NumberFieldRootState } from '../root/NumberFieldRoot';
import type { BaseUIComponentProps } from '../../internals/types';
import { stateAttributesMapping } from '../utils/stateAttributesMapping';
import { renderElement } from '../../internals/renderElement';

/**
 * Groups the input with the increment and decrement buttons.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Number Field](https://base-ui.com/react/components/number-field)
 */
export function NumberFieldGroup(componentProps: NumberFieldGroup.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { state } = useNumberFieldRootContext();

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-NumberField-Group',
    slot: 'number-field-group',
    state,
    props: [{ role: 'group' }, elementProps as Record<string, any>],
    stateAttributesMapping,
  });
}

export interface NumberFieldGroupState extends NumberFieldRootState {}

export interface NumberFieldGroupProps extends BaseUIComponentProps<'div', NumberFieldGroupState> {}

export namespace NumberFieldGroup {
  export type State = NumberFieldGroupState;
  export type Props = NumberFieldGroupProps;
}
