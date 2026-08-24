/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { useSelectGroupContext } from '../group/SelectGroupContext';
import { renderElement } from '../../internals/renderElement';

/**
 * An accessible label that is automatically associated with its parent group.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export function SelectGroupLabel(componentProps: SelectGroupLabel.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children', 'id']);

  const { setLabelId } = useSelectGroupContext();

  const id = createBaseUiId(() => local.id);

  createEffect(() => {
    setLabelId(id());
  });

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Select-GroupLabel',
    slot: 'select-group-label',
    props: [() => ({ id: id() }), elementProps],
  });
}

export interface SelectGroupLabelState {}

export interface SelectGroupLabelProps extends BaseUIComponentProps<'div', SelectGroupLabelState> {}

export namespace SelectGroupLabel {
  export type State = SelectGroupLabelState;
  export type Props = SelectGroupLabelProps;
}
