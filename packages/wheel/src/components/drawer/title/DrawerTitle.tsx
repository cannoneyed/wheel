/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useDrawerRootContext } from '../root/DrawerRootContext';
import { renderElement } from '../../internals/renderElement';
import { createBaseUiId } from '../../internals/createBaseUiId';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * A heading that labels the drawer.
 * Renders an `<h2>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 *
 * Deviation: upstream re-exports `Dialog.Title` directly. This Solid port's Drawer owns a separate
 * `DrawerStore` (see `DrawerStore`'s doc comment), so this is its own component — structurally
 * identical to `DialogTitle` otherwise.
 */
export function DrawerTitle(componentProps: DrawerTitle.Props): JSX.Element {
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

  store.syncValueWithCleanup('titleElementId', id);

  return renderElement('h2', componentProps, {
    defaultClass: 'wheel-Drawer-Title',
    slot: 'drawer-title',
    props: [() => ({ id: id() }), elementProps],
  });
}

export interface DrawerTitleProps extends BaseUIComponentProps<'h2', DrawerTitleState> {}

export interface DrawerTitleState {}

export namespace DrawerTitle {
  export type Props = DrawerTitleProps;
  export type State = DrawerTitleState;
}
