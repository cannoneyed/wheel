/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useNavigationMenuPositionerContext } from '../positioner/NavigationMenuPositionerContext';
import { useNavigationMenuRootContext } from '../root/NavigationMenuRootContext';
import type { Align, Side } from '../../utils/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import { popupStateMapping } from '../../utils/popupStateMapping';
import { renderElement } from '../../internals/renderElement';
import { getDisabledMountTransitionStyles } from '../../utils/getDisabledMountTransitionStyles';

/**
 * Displays an element pointing toward the navigation menu's current anchor.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 */
export function NavigationMenuArrow(componentProps: NavigationMenuArrow.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'ref',
  ]);

  const { open, transitionStatus } = useNavigationMenuRootContext();
  const { setArrowElement, side, align, arrowUncentered, arrowStyles } =
    useNavigationMenuPositionerContext();

  const state: NavigationMenuArrowState = {
    get open() {
      return open();
    },
    get side() {
      return side();
    },
    get align() {
      return align();
    },
    get uncentered() {
      return arrowUncentered();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-NavigationMenu-Arrow',
    slot: 'navigation-menu-arrow',
    state,
    ref: setArrowElement,
    props: [
      () => ({ style: arrowStyles(), 'aria-hidden': true }),
      () => getDisabledMountTransitionStyles(transitionStatus()),
      elementProps,
    ],
    stateAttributesMapping: popupStateMapping,
  });
}

export interface NavigationMenuArrowState {
  /**
   * Whether the popup is currently open.
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

export interface NavigationMenuArrowProps
  extends BaseUIComponentProps<'div', NavigationMenuArrowState> {}

export namespace NavigationMenuArrow {
  export type State = NavigationMenuArrowState;
  export type Props = NavigationMenuArrowProps;
}
