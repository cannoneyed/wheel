/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { useComboboxGroupContext } from '../group/ComboboxGroupContext';
import { renderElement } from '../../internals/renderElement';

/**
 * An accessible label that is automatically associated with its parent group.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export function ComboboxGroupLabel(componentProps: ComboboxGroupLabel.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const { setLabelId } = useComboboxGroupContext();

  const id = createBaseUiId(() => local.id);

  createEffect(() => {
    setLabelId(id());
  });
  onCleanup(() => {
    setLabelId(undefined);
  });

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Combobox-GroupLabel',
    slot: 'combobox-group-label',
    props: [() => ({ id: id() }), elementProps],
  });
}

export interface ComboboxGroupLabelState {}

export interface ComboboxGroupLabelProps
  extends BaseUIComponentProps<'div', ComboboxGroupLabelState> {}

export namespace ComboboxGroupLabel {
  export type State = ComboboxGroupLabelState;
  export type Props = ComboboxGroupLabelProps;
}
