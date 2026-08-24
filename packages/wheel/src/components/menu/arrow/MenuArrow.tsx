/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useMenuPositionerContext } from '../positioner/MenuPositionerContext';
import { useMenuRootContext } from '../root/MenuRootContext';
import { renderElement } from '../../internals/renderElement';
import type { Side, Align } from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import { popupStateMapping } from '../../utils/popupStateMapping';

/**
 * Displays an element positioned against the menu anchor.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuArrow(componentProps: MenuArrow.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { store } = useMenuRootContext();
  const positioner = useMenuPositionerContext();
  const open = store.useState('open');

  const state: MenuArrow.State = {
    get open() {
      return open();
    },
    get side() {
      return positioner.side();
    },
    get align() {
      return positioner.align();
    },
    get uncentered() {
      return positioner.arrowUncentered();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Menu-Arrow',
    slot: 'menu-arrow',
    ref: positioner.setArrowElement,
    stateAttributesMapping: popupStateMapping,
    state,
    props: [
      () => ({ style: positioner.arrowStyles(), 'aria-hidden': true }),
      elementProps,
    ],
  });
}

export interface MenuArrowState {
  /**
   * Whether the menu is currently open.
   */
  open: boolean;
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side;
  /**
   * The alignment of the component relative to the anchor.
   */
  align: Align;
  /**
   * Whether the arrow cannot be centered on the anchor.
   */
  uncentered: boolean;
}

export interface MenuArrowProps extends BaseUIComponentProps<'div', MenuArrowState> {}

export namespace MenuArrow {
  export type State = MenuArrowState;
  export type Props = MenuArrowProps;
}
