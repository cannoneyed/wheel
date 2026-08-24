/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useDrawerRootContext } from '../root/DrawerRootContext';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { DRAWER_CONTENT_ATTRIBUTE } from './DrawerContentDataAttributes';

/**
 * A container for the drawer contents.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 */
export function DrawerContent(componentProps: DrawerContent.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  useDrawerRootContext();

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Drawer-Content',
    slot: 'drawer-content',
    props: [{ [DRAWER_CONTENT_ATTRIBUTE]: '' }, elementProps],
  });
}

export interface DrawerContentProps extends BaseUIComponentProps<'div', DrawerContentState> {}

export interface DrawerContentState {}

export namespace DrawerContent {
  export type Props = DrawerContentProps;
  export type State = DrawerContentState;
}
