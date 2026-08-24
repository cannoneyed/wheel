/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { createRegisteredLabelId } from '../../internals/createRegisteredLabelId';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { useMenuGroupRootContext } from '../group/MenuGroupContext';

/**
 * An accessible label that is automatically associated with its parent group.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuGroupLabel(componentProps: MenuGroupLabel.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const setLabelId = useMenuGroupRootContext();
  const id = createRegisteredLabelId(() => local.id, setLabelId);

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Menu-GroupLabel',
    slot: 'menu-group-label',
    state: EMPTY_STATE,
    props: [() => ({ id: id(), role: 'presentation' as const }), elementProps],
  });
}

const EMPTY_STATE: MenuGroupLabel.State = {};

export interface MenuGroupLabelState {}

export interface MenuGroupLabelProps extends BaseUIComponentProps<'div', MenuGroupLabelState> {}

export namespace MenuGroupLabel {
  export type State = MenuGroupLabelState;
  export type Props = MenuGroupLabelProps;
}
