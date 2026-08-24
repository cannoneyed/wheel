/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useDrawerRootContext } from '../root/DrawerRootContext';
import { renderElement } from '../../internals/renderElement';
import { createBaseUiId } from '../../internals/createBaseUiId';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * A paragraph with additional information about the drawer.
 * Renders a `<p>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 *
 * Deviation: upstream re-exports `Dialog.Description` directly. This Solid port's Drawer owns a
 * separate `DrawerStore` (see `DrawerStore`'s doc comment), so this is its own component —
 * structurally identical to `DialogDescription` otherwise.
 */
export function DrawerDescription(componentProps: DrawerDescription.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
  ]);

  const store = useDrawerRootContext();

  const id = createBaseUiId(() => local.id);

  store.syncValueWithCleanup('descriptionElementId', id);

  return renderElement('p', componentProps, {
    defaultClass: 'wheel-Drawer-Description',
    slot: 'drawer-description',
    props: [() => ({ id: id() }), elementProps],
  });
}

export interface DrawerDescriptionProps extends BaseUIComponentProps<'p', DrawerDescriptionState> {}

export interface DrawerDescriptionState {}

export namespace DrawerDescription {
  export type Props = DrawerDescriptionProps;
  export type State = DrawerDescriptionState;
}
